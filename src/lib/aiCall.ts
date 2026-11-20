import Anthropic from '@anthropic-ai/sdk'
import { getRoleConfig, type AiRole } from '@/lib/aiModels'
import { extractFirstText } from '@/lib/aiResponse'
import { buildCallUsage, type AiCallUsage } from '@/lib/aiCost'

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
}): Promise<ClaudeCallResult> {
  const config = getRoleConfig(params.role)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:         config.model,
    max_tokens:    config.maxTokens,
    output_config: { effort: config.effort },
    system:        params.system,
    messages:      [{ role: 'user', content: params.user }],
  })

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
