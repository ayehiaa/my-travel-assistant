import Anthropic from '@anthropic-ai/sdk'
import { getRoleConfig } from '@/lib/aiModels'
import { normalizeUsage, type TokenTotals } from '@/lib/aiCost'
import { isKeyRejectedStatus } from '@/lib/aiKeyResolver'
import type { AssistantArea } from './areas'
import {
  BUSY_MESSAGE, FALLBACK_BETA, GENERIC_ERROR_MESSAGE, KEY_REJECTED_MESSAGE, MAX_JSON_RETRIES, MAX_TOOL_ITERATIONS,
} from './config'
import { decideNextStep, notRunResults, replayableContent } from './loopControl'
import { ASSISTANT_SYSTEM_PROMPT } from './systemPrompt'
import { buildTools, toolLabel } from './toolDefs'
import { runTool } from './tools'
import type { ToolContext } from './tools/context'
import { addTotals, turnCostUsd, ZERO_TOTALS } from './usage'

/**
 * My Assistant (specs/033) — the streaming manual tool-use loop (server only), following the official TypeScript
 * pattern: `client.beta.messages.stream()` + `stream.on('text')` + `await stream.finalMessage()`, typed API errors
 * rethrown, the SDK's JSON-parse error (eager input streaming) or a dropped connection retried at most twice,
 * `stop_reason` checked before content is read. Each assistant turn is persisted exactly as returned.
 */

export class AbortedByClient extends Error {}

export interface LoopIO {
  /** Streamed answer text. `reset` = drop the text streamed since the last status (a turn is being re-issued). */
  onText(delta: string, reset?: boolean): void
  onStatus(tool: string, label: string): void
  /** Append the assistant turn (content exactly as returned; [] for a refused turn). Returns the row id. */
  saveAssistant(content: unknown[], usage: Record<string, unknown>): Promise<string>
  /** Append one user message holding every tool_result of a turn. */
  saveToolResults(results: Anthropic.Beta.BetaToolResultBlockParam[]): Promise<void>
}

export interface LoopResult {
  messageId: string | null
  usage: TokenTotals
  costUsd: number
  toolsUsed: string[]
  refused: boolean
  notice: string | null
}

export const NOTICE_TRUNCATED = 'The answer was cut off — try asking for something narrower.'
export const NOTICE_CONTEXT_FULL = 'This conversation is too long — start a new chat to keep going.'
export const NOTICE_TOO_MANY_STEPS = `I stopped after ${MAX_TOOL_ITERATIONS} lookups — try a more specific question.`
const NOT_RUN_TRUNCATED = 'Not run: the request was cut off before this call was complete.'

/** Friendly text for an error thrown by the loop (never the raw message: it may contain request details). */
export function loopErrorMessage(err: unknown): { message: string; code: string } {
  if (err instanceof Anthropic.APIError) {
    if (isKeyRejectedStatus(err.status)) return { message: KEY_REJECTED_MESSAGE, code: 'key_rejected' }
    if (err.status === 429 || err.status === 529 || err.status === 503) return { message: BUSY_MESSAGE, code: 'busy' }
  }
  return { message: GENERIC_ERROR_MESSAGE, code: 'error' }
}

export async function runChatLoop(params: {
  apiKey: string
  areas: readonly AssistantArea[]
  /** Full history including the new user message (appended to, never edited). */
  messages: Anthropic.Beta.BetaMessageParam[]
  toolCtx: ToolContext
  signal: AbortSignal
  io: LoopIO
}): Promise<LoopResult> {
  const { io, signal } = params
  const cfg = getRoleConfig('assistant')
  const client = new Anthropic({ apiKey: params.apiKey, maxRetries: 2 })
  const tools = buildTools(params.areas)
  const messages = params.messages
  const result: LoopResult = { messageId: null, usage: { ...ZERO_TOTALS }, costUsd: 0, toolsUsed: [], refused: false, notice: null }

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let message: Anthropic.Beta.BetaMessage | null = null
    for (let attempt = 0; message === null; attempt++) {
      if (signal.aborted) throw new AbortedByClient()
      if (attempt > 0) io.onText('', true)
      const stream = client.beta.messages.stream(
        {
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          output_config: { effort: cfg.effort },
          // Stable, cacheable prefix: constant system prompt + deterministic tools (frozen per conversation).
          cache_control: { type: 'ephemeral' },
          system: ASSISTANT_SYSTEM_PROMPT,
          tools,
          messages,
          // Refusal fallbacks: a declined request is re-run on Anthropic's recommended model for that category.
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
        },
        { signal },
      )
      stream.on('text', delta => io.onText(delta))
      try {
        message = await stream.finalMessage()
      } catch (err) {
        if (signal.aborted) throw new AbortedByClient()
        // API errors (auth, rate limit, overload, bad request) are not retried here; the SDK already retried 429/5xx.
        if (err instanceof Anthropic.APIError || attempt >= MAX_JSON_RETRIES) throw err
        // Unparseable streamed tool input or a dropped connection: re-issue the same turn (nothing was appended).
      }
    }

    result.usage = addTotals(result.usage, message.usage)
    const cost = turnCostUsd(cfg.model, message.usage)
    result.costUsd = Math.round((result.costUsd + cost) * 1e6) / 1e6
    const usageRecord = {
      model: message.model,
      stop_reason: message.stop_reason,
      ...normalizeUsage(message.usage),
      cost_usd: cost,
    }

    // stop_reason first — content is read only after this decision.
    const step = decideNextStep(message)

    if (step.kind === 'refusal') {
      // Discard the (possibly partial) output and never run this turn's tools.
      result.messageId = await io.saveAssistant([], usageRecord)
      result.refused = true
      return result
    }

    const notice = step.kind === 'context_full' ? NOTICE_CONTEXT_FULL
      : step.kind === 'truncated_tool_call' || (step.kind === 'done' && step.truncated) ? NOTICE_TRUNCATED
      : null
    // Stored exactly as returned (thinking blocks included) so later turns replay it unchanged.
    result.messageId = await io.saveAssistant(message.content as unknown[], notice ? { ...usageRecord, notice } : usageRecord)
    messages.push({ role: 'assistant', content: replayableContent(message.content) as Anthropic.Beta.BetaContentBlockParam[] })

    if (step.kind === 'done') {
      if (step.truncated) result.notice = NOTICE_TRUNCATED
      return result
    }
    if (step.kind === 'context_full') {
      result.notice = NOTICE_CONTEXT_FULL
      return result
    }
    if (step.kind === 'truncated_tool_call') {
      // Keep the history valid: answer every cut-off call with an error result instead of running it.
      const results = notRunResults(step.toolUses, NOT_RUN_TRUNCATED)
      await io.saveToolResults(results)
      messages.push({ role: 'user', content: results })
      result.notice = NOTICE_TRUNCATED
      return result
    }
    if (step.kind === 'pause') continue

    // run_tools: every call in parallel, then ONE user message with every result.
    for (const t of step.toolUses) {
      io.onStatus(t.name, toolLabel(t.name))
      result.toolsUsed.push(t.name)
    }
    const results = await Promise.all(step.toolUses.map(t => runTool(params.toolCtx, { id: t.id, name: t.name, input: t.input })))
    await io.saveToolResults(results)
    messages.push({ role: 'user', content: results })
    if (signal.aborted) throw new AbortedByClient()
  }

  result.notice = NOTICE_TOO_MANY_STEPS
  return result
}
