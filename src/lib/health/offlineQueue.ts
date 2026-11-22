import { z } from 'zod'
import { LoggedSetSchema, WORKOUT_STATUSES, type LoggedSet } from './training'

/**
 * Offline set logging (specs/029 §9, phase P3). Pure — the browser keeps the queue (localStorage), the server merges.
 *
 * Every queued change carries a client id (idempotency: the same op sent twice is applied once) and a client
 * timestamp. Conflict rule: LAST WRITE WINS PER SET INDEX — for one date + session + exercise + set index (+ drop-set
 * flag) the newest op wins; on the server a queued op only replaces a stored set that was written earlier.
 */

const KeyRe = /^[a-z][a-z0-9_]{0,39}$/
const DateRe = /^\d{4}-\d{2}-\d{2}$/
const ClientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)

export const SetValuesSchema = LoggedSetSchema.omit({ setIndex: true, isDropSet: true })
export type SetValues = z.infer<typeof SetValuesSchema>

export const SetOpSchema = z.object({
  kind: z.literal('set'),
  clientId: ClientId,
  date: z.string().regex(DateRe),
  sessionKey: z.string().regex(KeyRe),
  exerciseKey: z.string().regex(KeyRe),
  setIndex: z.number().int().min(0).max(19),
  isDropSet: z.boolean().default(false),
  /** null = the set was un-done / removed. */
  set: SetValuesSchema.nullable(),
  /** Client epoch milliseconds when the change was made. */
  at: z.number().int().min(0),
}).strict()
export type SetOp = z.infer<typeof SetOpSchema>

export const FinishOpSchema = z.object({
  kind: z.literal('finish'),
  clientId: ClientId,
  date: z.string().regex(DateRe),
  sessionKey: z.string().regex(KeyRe),
  status: z.enum(WORKOUT_STATUSES),
  skipReason: z.string().trim().min(1).max(300).nullable().optional(),
  travelMode: z.boolean().default(false),
  durationMinutes: z.number().int().min(0).max(600).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  duringPain: z.number().int().min(0).max(10).nullable().optional(),
  skippedExercises: z.array(z.object({ exerciseKey: z.string().regex(KeyRe), reason: z.string().trim().max(200).default('') })).max(40).default([]),
  at: z.number().int().min(0),
}).strict()
export type FinishOp = z.infer<typeof FinishOpSchema>

export const QueueOpSchema = z.discriminatedUnion('kind', [SetOpSchema, FinishOpSchema])
export type QueueOp = z.infer<typeof QueueOpSchema>

export const MAX_QUEUE = 500
export const SyncInputSchema = z.object({ ops: z.array(QueueOpSchema).min(1).max(MAX_QUEUE) }).strict()

export const OFFLINE_QUEUE_STORAGE_KEY = 'health-offline-queue:v1'

/** Read a stored queue defensively (invalid entries dropped). */
export function readQueue(raw: string | null | undefined): QueueOp[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(o => QueueOpSchema.safeParse(o)).filter(r => r.success).map(r => r.data as QueueOp).slice(-MAX_QUEUE)
  } catch {
    return []
  }
}

/** Append an op (idempotent by clientId; the oldest ops drop off beyond MAX_QUEUE). */
export function enqueue(queue: readonly QueueOp[], op: QueueOp): QueueOp[] {
  if (queue.some(q => q.clientId === op.clientId)) return [...queue]
  return [...queue, op].slice(-MAX_QUEUE)
}

export function setOpKey(op: Pick<SetOp, 'date' | 'sessionKey' | 'exerciseKey' | 'setIndex' | 'isDropSet'>): string {
  return `${op.date}|${op.sessionKey}|${op.exerciseKey}|${op.setIndex}|${op.isDropSet ? 'd' : 'w'}`
}

/** Later op wins; equal timestamps resolve deterministically by client id. */
function newer<T extends { at: number; clientId: string }>(a: T, b: T): T {
  if (a.at !== b.at) return a.at > b.at ? a : b
  return a.clientId > b.clientId ? a : b
}

/** Last write wins per set index (date + session + exercise + set index + drop flag). */
export function mergeSetOps(ops: readonly SetOp[]): SetOp[] {
  const byKey = new Map<string, SetOp>()
  for (const op of ops) {
    const k = setOpKey(op)
    const cur = byKey.get(k)
    byKey.set(k, cur ? newer(cur, op) : op)
  }
  return [...byKey.values()]
}

/** Sets waiting to sync (after merging; removals are not counted). */
export function queuedSetCount(queue: readonly QueueOp[]): number {
  return mergeSetOps(queue.filter((o): o is SetOp => o.kind === 'set')).filter(o => o.set !== null).length
}

export interface QueueGroup {
  date: string
  sessionKey: string
  sets: SetOp[]
  finish: FinishOp | null
  clientIds: string[]
}

/** Group a queue per date + session (merged sets, latest finish op). Ordered by date, then session. */
export function groupQueue(queue: readonly QueueOp[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup>()
  for (const op of queue) {
    const k = `${op.date}|${op.sessionKey}`
    const g = groups.get(k) ?? { date: op.date, sessionKey: op.sessionKey, sets: [], finish: null, clientIds: [] }
    g.clientIds.push(op.clientId)
    if (op.kind === 'set') g.sets.push(op)
    else g.finish = g.finish ? newer(g.finish, op) : op
    groups.set(k, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, sets: mergeSetOps(g.sets) }))
    .sort((a, b) => (a.date === b.date ? a.sessionKey.localeCompare(b.sessionKey) : a.date.localeCompare(b.date)))
}

/** Remove acknowledged ops (applied, superseded or rejected by the server). */
export function removeAcked(queue: readonly QueueOp[], acked: readonly string[]): QueueOp[] {
  const set = new Set(acked)
  return queue.filter(o => !set.has(o.clientId))
}

// ── Server-side merge ───────────────────────────────────────────────────────

export interface StoredSet extends LoggedSet {
  exerciseKey: string
  clientId: string | null
  /** When this set was last written (client time of the op that wrote it, else the workout's save time), ms. */
  writtenAt: number
}

/**
 * Apply merged queued ops to the stored sets of one workout: an op replaces (or removes) the stored set with the same
 * index only when it is not older than it. Op times are clamped to `nowMs` so a device clock running ahead cannot win
 * every future conflict. Ops whose client id is already stored are no-ops (idempotent replay).
 */
export function applySetOps(stored: readonly StoredSet[], ops: readonly SetOp[], nowMs: number): { sets: StoredSet[]; applied: string[]; superseded: string[] } {
  const key = (s: { exerciseKey: string; setIndex: number; isDropSet: boolean }) => `${s.exerciseKey}|${s.setIndex}|${s.isDropSet ? 'd' : 'w'}`
  const byKey = new Map(stored.map(s => [key(s), s]))
  const applied: string[] = []
  const superseded: string[] = []
  for (const op of mergeSetOps(ops)) {
    const k = key(op)
    const cur = byKey.get(k)
    if (cur && cur.clientId === op.clientId) { applied.push(op.clientId); continue }
    const at = Math.min(op.at, nowMs)
    if (cur && cur.writtenAt > at) { superseded.push(op.clientId); continue }
    if (op.set === null) byKey.delete(k)
    else byKey.set(k, { ...op.set, setIndex: op.setIndex, isDropSet: op.isDropSet, exerciseKey: op.exerciseKey, clientId: op.clientId, writtenAt: at })
    applied.push(op.clientId)
  }
  const sets = [...byKey.values()].sort((a, b) => (a.exerciseKey === b.exerciseKey ? a.setIndex - b.setIndex || Number(a.isDropSet) - Number(b.isDropSet) : a.exerciseKey.localeCompare(b.exerciseKey)))
  return { sets, applied, superseded }
}

/** Stored sets → the workout input's exercises array (exercise order preserved by first appearance). */
export function setsToExercises(sets: readonly StoredSet[]): Array<{ exerciseKey: string; sets: LoggedSet[] }> {
  const out = new Map<string, LoggedSet[]>()
  for (const s of sets) {
    const list = out.get(s.exerciseKey) ?? []
    list.push({ setIndex: s.setIndex, loadKg: s.loadKg, reps: s.reps, holdSeconds: s.holdSeconds, rir: s.rir, toFailure: s.toFailure, isDropSet: s.isDropSet })
    out.set(s.exerciseKey, list)
  }
  return [...out.entries()].map(([exerciseKey, list]) => ({ exerciseKey, sets: list }))
}

/** A client id for an op (crypto.randomUUID where available). */
export function newClientId(random: () => string = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`)): string {
  return random().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64).padEnd(8, '0')
}
