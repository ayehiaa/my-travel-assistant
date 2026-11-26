import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { answerText, replayableContent } from './loopControl'
import { isContextBlockText, splitFollowUps } from './text'

/**
 * My Assistant (specs/033) — stored rows → API history and → UI messages. Pure.
 * Rows are append-only: a user question (context block + question text), assistant turns (content exactly as the
 * API returned it) and tool-result user messages, ordered by `seq`.
 */

export interface StoredMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: unknown
  usage?: unknown
  created_at: string
  seq?: number | null
}

export const StoredUsageSchema = z.object({
  model: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  cost_usd: z.number().optional(),
  notice: z.string().optional(),
}).passthrough()
export type StoredUsage = z.infer<typeof StoredUsageSchema>

export function readStoredUsage(raw: unknown): StoredUsage {
  const p = StoredUsageSchema.safeParse(raw)
  return p.success ? p.data : {}
}

type AnyBlock = { type: string; [k: string]: unknown }

function blocksOf(content: unknown): AnyBlock[] {
  return Array.isArray(content) ? (content.filter(b => b && typeof b === 'object' && typeof (b as AnyBlock).type === 'string') as AnyBlock[]) : []
}

/** A user row that carries a question (not only tool results). */
export function isQuestionRow(row: Pick<StoredMessageRow, 'role' | 'content'>): boolean {
  return row.role === 'user' && blocksOf(row.content).some(b => b.type === 'text')
}

/** The question text of a user row (the context block is hidden). */
export function questionText(content: unknown): string {
  const texts = blocksOf(content).filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text as string)
  return texts.filter(t => !isContextBlockText(t)).join('\n\n')
}

function sorted(rows: readonly StoredMessageRow[]): StoredMessageRow[] {
  return [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.created_at.localeCompare(b.created_at))
}

/**
 * Messages for the next API call: every stored row in order, content unchanged. Assistant rows with no content (a
 * refused turn whose partial output was discarded) are skipped; assistant content goes through replayableContent
 * (identity unless the turn contains a mid-output fallback boundary).
 */
export function toApiMessages(rows: readonly StoredMessageRow[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = []
  for (const row of sorted(rows)) {
    const blocks = blocksOf(row.content)
    if (blocks.length === 0) continue
    if (row.role === 'assistant') {
      out.push({ role: 'assistant', content: replayableContent(blocks) as unknown as Anthropic.Beta.BetaContentBlockParam[] })
    } else {
      out.push({ role: 'user', content: blocks as unknown as Anthropic.Beta.BetaContentBlockParam[] })
    }
  }
  return out
}

export interface UiUserMessage {
  id: string
  role: 'user'
  text: string
  createdAt: string
}

export interface UiAssistantMessage {
  id: string
  role: 'assistant'
  text: string
  followUps: string[]
  tools: string[]
  refused: boolean
  notice: string | null
  costUsd: number
  createdAt: string
}

export type UiMessage = UiUserMessage | UiAssistantMessage

/** UI view: one bubble per question and one per answer (all assistant turns of that answer merged). Never thinking. */
export function toUiMessages(rows: readonly StoredMessageRow[]): UiMessage[] {
  const out: UiMessage[] = []
  let current: UiAssistantMessage | null = null
  const close = () => {
    if (!current) return
    const { body, followUps } = splitFollowUps(current.text)
    current.text = body
    current.followUps = followUps
    out.push(current)
    current = null
  }
  for (const row of sorted(rows)) {
    if (isQuestionRow(row)) {
      close()
      out.push({ id: row.id, role: 'user', text: questionText(row.content), createdAt: row.created_at })
      continue
    }
    if (row.role !== 'assistant') continue
    const usage = readStoredUsage(row.usage)
    const blocks = blocksOf(row.content)
    current ??= { id: row.id, role: 'assistant', text: '', followUps: [], tools: [], refused: false, notice: null, costUsd: 0, createdAt: row.created_at }
    const text = answerText(blocks)
    if (text) current.text = current.text ? `${current.text}\n\n${text}` : text
    for (const b of blocks) if (b.type === 'tool_use' && typeof b.name === 'string') current.tools.push(b.name)
    if (usage.stop_reason === 'refusal') current.refused = true
    if (usage.notice) current.notice = usage.notice
    current.costUsd = Math.round((current.costUsd + (usage.cost_usd ?? 0)) * 1e6) / 1e6
  }
  close()
  return out
}
