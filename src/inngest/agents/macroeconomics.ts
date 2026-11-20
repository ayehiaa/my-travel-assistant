import type { AgentRunResult } from '@/inngest/agents/types'
import { callClaude } from '@/lib/aiCall'
import { parseAgentResponse } from '@/lib/aiResponse'
import { fetchFredData } from '@/inngest/dataSources/fred'
import { withIslamicMandate } from '@/lib/islamicMandate'
import { describeTickers } from '@/inngest/agents/portfolioContext'

export interface MacroAgentInput {
  risk_profile: string
  target_return_pct: number
  target_horizon: 'monthly' | 'annual'
  holdings_tickers: string[]
  is_new_portfolio?: boolean
}

const SYSTEM_PROMPT =
  'You are a macroeconomic analyst specializing in US market conditions. ' +
  'Analyze the Federal Reserve economic indicators provided and assess their implications ' +
  'for a US stock portfolio. Focus on: GDP growth trajectory, inflation trends, employment data, ' +
  'and consumer confidence — and whether these conditions historically support or hinder ' +
  'the level of equity returns implied by the investor\'s target return (see portfolio context). ' +
  'Conclude with an explicit sentence stating whether current macro conditions make the target return achievable, at risk, or unrealistic. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runMacroeconomicsAgent(input: MacroAgentInput): Promise<AgentRunResult> {
  const seriesData = await fetchFredData()

  const indicatorLines = seriesData
    .map(s => `${s.title} (${s.unit}): latest ${s.latest_value !== null ? s.latest_value : 'N/A'}`)
    .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    describeTickers(input.holdings_tickers, input.is_new_portfolio)

  const userContent = `Economic indicators:\n${indicatorLines}${portfolioContext}`

  const { text, stopReason, usage } = await callClaude({
    role:   'agent',
    name:   'macroeconomics',
    system: withIslamicMandate(SYSTEM_PROMPT),
    user:   userContent,
  })

  return { output: parseAgentResponse(text, stopReason), usage }
}
