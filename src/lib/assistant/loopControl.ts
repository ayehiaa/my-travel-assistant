import type Anthropic from '@anthropic-ai/sdk'

/**
 * My Assistant (specs/033) — pure decisions for the streaming manual tool-use loop.
 * Follows the official pattern: check stop_reason BEFORE reading content; never run tools of a refused or truncated
 * turn; resume pause_turn by re-sending; otherwise run every tool_use block and answer them in ONE user message.
 */

type Block = Anthropic.Beta.BetaContentBlock
type ToolUse = Anthropic.Beta.BetaToolUseBlock

export type NextStep =
  /** Finished answer (end_turn / stop_sequence / any terminal stop without tool calls). `truncated` = max_tokens. */
  | { kind: 'done'; truncated: boolean }
  /** The whole fallback chain declined: show the friendly refusal, discard partial output, run nothing. */
  | { kind: 'refusal' }
  /** Server paused a long turn: append the assistant content and call again. */
  | { kind: 'pause' }
  /** max_tokens hit while a tool call was being written: its input may be cut off — do not run it. */
  | { kind: 'truncated_tool_call'; toolUses: ToolUse[] }
  /** The conversation no longer fits the context window. */
  | { kind: 'context_full' }
  /** Run these tools (all of them, in parallel) and send ONE user message with every tool_result. */
  | { kind: 'run_tools'; toolUses: ToolUse[] }

export function decideNextStep(message: { stop_reason: string | null; content: readonly Block[] }): NextStep {
  const stop = message.stop_reason
  if (stop === 'refusal') return { kind: 'refusal' }
  if (stop === 'pause_turn') return { kind: 'pause' }
  if (stop === 'model_context_window_exceeded') return { kind: 'context_full' }
  if (stop === 'end_turn' || stop === 'stop_sequence') return { kind: 'done', truncated: false }
  const toolUses = runnableToolUses(message.content)
  if (stop === 'max_tokens') return toolUses.length > 0 ? { kind: 'truncated_tool_call', toolUses } : { kind: 'done', truncated: true }
  if (toolUses.length === 0) return { kind: 'done', truncated: false }
  return { kind: 'run_tools', toolUses }
}

function lastFallbackIndex(content: readonly { type: string }[]): number {
  for (let i = content.length - 1; i >= 0; i--) if (content[i].type === 'fallback') return i
  return -1
}

/**
 * tool_use blocks the loop may execute: all of them, except after a mid-output fallback, where only blocks after the
 * last `fallback` block belong to the model that finished the turn.
 */
export function runnableToolUses(content: readonly Block[]): ToolUse[] {
  const from = lastFallbackIndex(content) + 1
  return content.slice(from).filter((b): b is ToolUse => b.type === 'tool_use')
}

const OMIT_BEFORE_FALLBACK = new Set(['thinking', 'redacted_thinking', 'tool_use'])

/**
 * Assistant content as it must be sent back on later turns. Content is stored exactly as returned and replayed
 * unchanged — the one documented exception: after a mid-output fallback, thinking / redacted_thinking / tool_use blocks
 * BEFORE the last `fallback` block are omitted (the `fallback` block itself stays where it appeared).
 */
export function replayableContent<T extends { type: string }>(content: readonly T[]): T[] {
  const boundary = lastFallbackIndex(content)
  if (boundary < 0) return [...content]
  return content.filter((b, i) => i >= boundary || !OMIT_BEFORE_FALLBACK.has(b.type))
}

/** Plain answer text of an assistant turn (text blocks only; thinking is never shown). */
export function answerText(content: readonly { type: string; text?: unknown }[]): string {
  return content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('')
}

/** One tool_result per tool_use (is_error), for calls that were not run (truncated input, aborted request). */
export function notRunResults(toolUses: readonly { id: string }[], reason: string): Anthropic.Beta.BetaToolResultBlockParam[] {
  return toolUses.map(t => ({ type: 'tool_result' as const, tool_use_id: t.id, is_error: true, content: reason }))
}

/**
 * tool_use ids of the LAST assistant message that have no tool_result in a later user message (e.g. the request was
 * aborted between the call and its results). The loop appends error results for them before the next question so
 * the history stays valid without editing anything already stored.
 */
export function danglingToolUseIds(messages: readonly Anthropic.Beta.BetaMessageParam[]): string[] {
  let lastAssistant = -1
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') { lastAssistant = i; break }
  if (lastAssistant < 0) return []
  const content = messages[lastAssistant].content
  if (!Array.isArray(content)) return []
  const ids = content.filter(b => b.type === 'tool_use').map(b => (b as { id: string }).id)
  if (ids.length === 0) return []
  const answered = new Set<string>()
  for (const m of messages.slice(lastAssistant + 1)) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue
    for (const b of m.content) if (b.type === 'tool_result') answered.add(b.tool_use_id)
  }
  return ids.filter(id => !answered.has(id))
}
