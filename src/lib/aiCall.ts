import Anthropic from '@anthropic-ai/sdk'
import { NonRetriableError } from 'inngest'
import { getRoleConfig, type AiRole } from '@/lib/aiModels'
import { extractFirstText } from '@/lib/aiResponse'
import { buildCallUsage, type AiCallUsage } from '@/lib/aiCost'
import { AI_KEY_REJECTED_MESSAGE, isKeyRejectedStatus, redactSecrets } from '@/lib/aiKeyResolver'

/**
 * Server only. One code path for every portfolio-analysis Claude call.
 * Sends only model / max_tokens / output_config.effort / system / messages: adaptive thinking is the model default,
 * and sampling params, disabled thinking and forced tool_choice are rejected by Claude Sonnet 5.5.
 */

export interface ClaudeCallResult {
  /** First text block ('' when none). Check stopReason before trusting it. */
  text: string
  stopReason: string | null
  usage: AiCallUsage
}

export async function callClaude(params: {
  role: AiRole
  /** Name recorded in usage, e.g. the agent key. */
  name: string
  system: string
  user: string
  /**
   * The run owner's Anthropic API key (specs/026 — each user pays for their own runs), resolved inside the calling
   * Inngest step via requireRunApiKey(). Required: there is no silent fallback to the app key.
   */
  apiKey: string
}): Promise<ClaudeCallResult> {
  const config = getRoleConfig(params.role)
  const client = new Anthropic({ apiKey: params.apiKey })

  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model:         config.model,
      max_tokens:    config.maxTokens,
      output_config: { effort: config.effort },
      system:        params.system,
      messages:      [{ role: 'user', content: params.user }],
    })
  } catch (err) {
    // Revoked / invalid key: fail the run at once with a clear message (retrying cannot help).
    if (isKeyRejectedStatus((err as { status?: unknown } | null)?.status)) throw new NonRetriableError(AI_KEY_REJECTED_MESSAGE)
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(redactSecrets(message, [params.apiKey]))
  }

  const stopReason = response.stop_reason ?? null
  return {
    // Responses can begin with thinking blocks — read the first text block, and only after the stop reason is known.
    text:  stopReason === 'refusal' ? '' : extractFirstText(response.content),
    stopReason,
    usage: buildCallUsage({
      role:       params.role,
      name:       params.name,
      model:      config.model,
      stopReason,
      usage:      response.usage,
    }),
  }
}
