import type { AgentRunResult } from '@/inngest/agents/types'
import { callClaude } from '@/lib/aiCall'
import { parseAgentResponse } from '@/lib/aiResponse'
import { fetchFedRatesData } from '@/inngest/dataSources/fred'
import { withIslamicMandate } from '@/lib/islamicMandate'
import { describeTickers } from '@/inngest/agents/portfolioContext'

export interface FedRatesAgentInput {
  risk_profile: string
  target_return_pct: number
  target_horizon: 'monthly' | 'annual'
  holdings_tickers: string[]
  is_new_portfolio?: boolean
}

const SYSTEM_PROMPT =
  'You are a fixed income and monetary policy analyst specializing in US interest rate dynamics. ' +
  'Analyze the Federal Reserve interest rate data provided and assess the implications ' +
  'for a US stock portfolio. Focus on: current rate trajectory (hiking / cutting / pausing cycle), ' +
  'yield curve shape derived from the 2-year vs 30-year spread (normal / flat / inverted), ' +
  'and any forward guidance signals embedded in the spread between the Fed target rate and the effective rate. ' +
  'Explicitly assess whether the current rate environment compresses or expands the equity risk premium ' +
  'enough to make the investor\'s target return (see portfolio context) achievable without taking on excessive risk. ' +
  'Conclude with a direct statement on whether rate conditions support or undermine the target. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runFedRatesAgent(input: FedRatesAgentInput): Promise<AgentRunResult> {
  const seriesData = await fetchFedRatesData()

  const indicatorLines = seriesData
    .map(s => `${s.title} (${s.unit}): latest ${s.latest_value !== null ? s.latest_value : 'N/A'}`)
    .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    describeTickers(input.holdings_tickers, input.is_new_portfolio)

  const userContent = `Interest rate indicators:\n${indicatorLines}${portfolioContext}`

  const { text, stopReason, usage } = await callClaude({
    role:   'agent',
    name:   'fed_rates',
    system: withIslamicMandate(SYSTEM_PROMPT),
    user:   userContent,
  })

  return { output: parseAgentResponse(text, stopReason), usage }
}
