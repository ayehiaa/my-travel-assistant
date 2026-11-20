/**
 * Central model ids and per-role request settings for the portfolio-analysis Claude calls.
 * Change a role's model or effort here — call sites read it through getRoleConfig().
 * (Expenses / Gmail parsing use their own Haiku calls and are intentionally not routed through this module.)
 */

export const AI_MODELS = {
  SONNET_5_5: 'claude-sonnet-5-5',
} as const

export type AiModelId = (typeof AI_MODELS)[keyof typeof AI_MODELS]

/** Effort levels accepted in `output_config.effort`. */
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AiRole = 'agent' | 'synthesizer' | 'shariah_reviewer'

export interface AiRoleConfig {
  model: AiModelId
  /** Thinking tokens count toward max_tokens on adaptive-thinking models — leave room for both. */
  maxTokens: number
  effort: AiEffort
}

export const AI_ROLE_CONFIG: Readonly<Record<AiRole, AiRoleConfig>> = {
  agent:            { model: AI_MODELS.SONNET_5_5, maxTokens: 8000,  effort: 'medium' },
  synthesizer:      { model: AI_MODELS.SONNET_5_5, maxTokens: 16000, effort: 'high' },
  shariah_reviewer: { model: AI_MODELS.SONNET_5_5, maxTokens: 16000, effort: 'high' },
}

export function getRoleConfig(role: AiRole): AiRoleConfig {
  return AI_ROLE_CONFIG[role]
}
