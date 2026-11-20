import type { AgentRunResult } from '@/inngest/agents/types'
import { callClaude } from '@/lib/aiCall'
import { parseAgentResponse } from '@/lib/aiResponse'
import { fetchGeopoliticsArticles } from '@/inngest/dataSources/newsapi'
import { withIslamicMandate } from '@/lib/islamicMandate'
import { describeTickers } from '@/inngest/agents/portfolioContext'

export interface GeopoliticsAgentInput {
  risk_profile: string
  target_return_pct: number
  target_horizon: 'monthly' | 'annual'
  holdings_tickers: string[]
  is_new_portfolio?: boolean
}

const SYSTEM_PROMPT =
  'You are a geopolitical risk analyst specializing in the impact of global events on US equities. ' +
  'Analyze the news headlines provided and assess the implications for a US stock portfolio. ' +
  'Focus on: trade policy shifts (tariffs, sanctions, export controls), ' +
  'election outcomes and political transitions, ' +
  'regional conflicts and their supply chain / energy effects, ' +
  'and central bank coordination signals. ' +
  'Explicitly assess whether geopolitical conditions are a net headwind or tailwind for achieving ' +
  'the investor\'s target return (see portfolio context), and size the risk — minor friction, ' +
  'significant headwind, or potential portfolio-level threat. Conclude with a direct statement. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runGeopoliticsAgent(input: GeopoliticsAgentInput): Promise<AgentRunResult> {
  const articles = await fetchGeopoliticsArticles()

  const articleContent = articles.length === 0
    ? 'No recent geopolitical news articles found.'
    : articles
        .map(a => `- ${a.title}: ${a.description ?? 'No description.'}`)
        .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    describeTickers(input.holdings_tickers, input.is_new_portfolio)

  const userContent = `Recent geopolitical headlines:\n${articleContent}${portfolioContext}`

  const { text, stopReason, usage } = await callClaude({
    role:   'agent',
    name:   'geopolitics',
    system: withIslamicMandate(SYSTEM_PROMPT),
    user:   userContent,
  })

  return { output: parseAgentResponse(text, stopReason), usage }
}
