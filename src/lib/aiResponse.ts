import { z } from 'zod'
import type { AgentOutput } from '@/types/database'

/**
 * Pure helpers for reading Claude Messages API responses.
 * Responses from adaptive-thinking models can start with `thinking` blocks, so never read content[0].
 */

interface ContentBlockLike {
  type: string
  text?: unknown
}

/** Text of the first `type === "text"` block, or '' when there is none. */
export function extractFirstText(content: ReadonlyArray<ContentBlockLike> | null | undefined): string {
  if (!content) return ''
  const block = content.find(b => b.type === 'text')
  return block && typeof block.text === 'string' ? block.text : ''
}

export type StopCheck = { ok: true } | { ok: false; reason: 'refusal' | 'max_tokens' }

/** A response is complete unless the model refused or ran out of tokens (thinking included). */
export function checkStopReason(stopReason: string | null | undefined): StopCheck {
  if (stopReason === 'refusal')    return { ok: false, reason: 'refusal' }
  if (stopReason === 'max_tokens') return { ok: false, reason: 'max_tokens' }
  return { ok: true }
}

/** Throws for refusal / max_tokens so the calling Inngest step retries and, if it keeps failing, fails safely. */
export function assertCompleteResponse(stopReason: string | null | undefined, label: string): void {
  const check = checkStopReason(stopReason)
  if (check.ok) return
  if (check.reason === 'refusal') throw new Error(`${label} declined the request (refusal)`)
  throw new Error(`${label} ran out of output tokens before finishing (max_tokens)`)
}

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export const AGENT_REFUSAL_ANALYSIS =
  'This agent could not produce an analysis for this run (the model declined the request). ' +
  'Treat this view as unavailable.'

/**
 * Turns an agent's raw text into an AgentOutput. A refusal, or text that is not the expected JSON
 * (including a max_tokens truncation), falls back to a neutral, low-confidence output — agents never fail a run.
 */
export function parseAgentResponse(text: string, stopReason: string | null | undefined): AgentOutput {
  const check = checkStopReason(stopReason)
  if (!check.ok && check.reason === 'refusal') {
    return { analysis: AGENT_REFUSAL_ANALYSIS, confidence: 'low', stance: 'neutral' }
  }
  try {
    const result = AgentOutputSchema.safeParse(JSON.parse(text))
    return result.success ? result.data : { analysis: text, confidence: 'low', stance: 'neutral' }
  } catch {
    return { analysis: text, confidence: 'low', stance: 'neutral' }
  }
}
