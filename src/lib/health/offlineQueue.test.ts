import { describe, expect, it } from 'vitest'
import {
  applySetOps, enqueue, groupQueue, mergeSetOps, newClientId, queuedSetCount, readQueue, removeAcked, setsToExercises,
  SyncInputSchema, type FinishOp, type QueueOp, type SetOp, type StoredSet,
} from './offlineQueue'

const V = { loadKg: 10, reps: 12, holdSeconds: null, rir: 2, toFailure: false }

function setOp(id: string, at: number, patch: Partial<SetOp> = {}): SetOp {
  return { kind: 'set', clientId: `client-${id}`, date: '2026-11-22', sessionKey: 'a', exerciseKey: 'press', setIndex: 0, isDropSet: false, set: V, at, ...patch }
}
function finishOp(id: string, at: number, patch: Partial<FinishOp> = {}): FinishOp {
  return { kind: 'finish', clientId: `client-${id}`, date: '2026-11-22', sessionKey: 'a', status: 'done', travelMode: false, skippedExercises: [], at, ...patch }
}

describe('queue basics', () => {
  it('enqueue is idempotent by client id and bounded', () => {
    let q: QueueOp[] = []
    q = enqueue(q, setOp('1', 1))
    q = enqueue(q, setOp('1', 2))
    expect(q).toHaveLength(1)
    for (let i = 0; i < 600; i++) q = enqueue(q, setOp(`n${i}`, i))
    expect(q).toHaveLength(500)
    expect(q[q.length - 1].clientId).toBe('client-n599')
  })
  it('readQueue drops invalid entries and survives garbage', () => {
    expect(readQueue('not json')).toEqual([])
    expect(readQueue(JSON.stringify([setOp('1', 1), { kind: 'set', clientId: 'x' }]))).toHaveLength(1)
    expect(readQueue(null)).toEqual([])
  })
  it('removeAcked', () => {
    expect(removeAcked([setOp('1', 1), setOp('2', 2)], ['client-1'])).toEqual([setOp('2', 2)])
  })
  it('newClientId gives a valid id', () => {
    expect(newClientId(() => 'abc')).toBe('abc00000')
    expect(SyncInputSchema.safeParse({ ops: [setOp('1', 1, { clientId: newClientId() })] }).success).toBe(true)
  })
})

describe('last write wins per set index', () => {
  it('keeps the newest op per set key, ties by client id', () => {
    const merged = mergeSetOps([
      setOp('a', 5, { set: { ...V, reps: 10 } }),
      setOp('b', 9, { set: { ...V, reps: 12 } }),
      setOp('c', 7, { set: { ...V, reps: 11 } }),
      setOp('d', 3, { setIndex: 1 }),
      setOp('e', 3, { setIndex: 1, isDropSet: true }),
    ])
    expect(merged).toHaveLength(3)
    expect(merged.find(o => o.setIndex === 0 && !o.isDropSet)!.set!.reps).toBe(12)
    expect(mergeSetOps([setOp('x', 1), setOp('y', 1)])[0].clientId).toBe('client-y')
  })
  it('counts queued sets, not removals', () => {
    expect(queuedSetCount([setOp('1', 1), setOp('2', 2, { setIndex: 1 }), setOp('3', 3, { setIndex: 1, set: null }), finishOp('f', 4)])).toBe(1)
  })
  it('groups per date + session with the latest finish', () => {
    const groups = groupQueue([
      setOp('1', 1), finishOp('f1', 2, { status: 'partial' }), finishOp('f2', 5), setOp('2', 3, { sessionKey: 'b' }), setOp('3', 1, { date: '2026-11-21' }),
    ])
    expect(groups.map(g => `${g.date}:${g.sessionKey}`)).toEqual(['2026-11-21:a', '2026-11-22:a', '2026-11-22:b'])
    expect(groups[1].finish!.status).toBe('done')
    expect(groups[1].clientIds).toEqual(['client-1', 'client-f1', 'client-f2'])
  })
})

describe('server merge (applySetOps)', () => {
  const stored = (patch: Partial<StoredSet> = {}): StoredSet => ({ exerciseKey: 'press', setIndex: 0, isDropSet: false, ...V, clientId: null, writtenAt: 100, ...patch })
  it('newer op replaces, older op is superseded', () => {
    const r = applySetOps([stored()], [setOp('new', 200, { set: { ...V, reps: 15 } })], 1000)
    expect(r.applied).toEqual(['client-new'])
    expect(r.sets[0]).toMatchObject({ reps: 15, clientId: 'client-new', writtenAt: 200 })
    const old = applySetOps([stored({ writtenAt: 500 })], [setOp('old', 200)], 1000)
    expect(old.superseded).toEqual(['client-old'])
    expect(old.sets[0].reps).toBe(12)
  })
  it('removals delete, new indexes are added, replays are no-ops', () => {
    const r = applySetOps([stored()], [setOp('rm', 200, { set: null }), setOp('add', 200, { setIndex: 2 })], 1000)
    expect(r.sets.map(s => s.setIndex)).toEqual([2])
    const replay = applySetOps([stored({ clientId: 'client-x', writtenAt: 900 })], [setOp('x', 50)], 1000)
    expect(replay.applied).toEqual(['client-x'])
    expect(replay.superseded).toEqual([])
  })
  it('clamps future client clocks to now', () => {
    const r = applySetOps([], [setOp('f', 10_000)], 1000)
    expect(r.sets[0].writtenAt).toBe(1000)
  })
  it('setsToExercises', () => {
    const ex = setsToExercises([stored(), stored({ setIndex: 1 }), stored({ exerciseKey: 'row' })])
    expect(ex.map(e => [e.exerciseKey, e.sets.length])).toEqual([['press', 2], ['row', 1]])
    expect(ex[0].sets[0]).not.toHaveProperty('clientId')
  })
})
