import type { AgentOutput } from '@/types/database'
import type { AiCallUsage } from '@/lib/aiCost'

/** What every analysis agent returns: its output plus the token usage of its Claude call. */
export interface AgentRunResult {
  output: AgentOutput
  usage: AiCallUsage
}
