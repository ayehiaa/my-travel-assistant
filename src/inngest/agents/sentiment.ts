import type { AgentRunResult } from '@/inngest/agents/types'
import { callClaude } from '@/lib/aiCall'
import { parseAgentResponse } from '@/lib/aiResponse'
import { fetchSentimentArticles } from '@/inngest/dataSources/newsapi'
import { withIslamicMandate } from '@/lib/islamicMandate'
import { describeTickers } from '@/inngest/agents/portfolioContext'

export interface SentimentAgentInput {
  risk_profile: string
  target_return_pct: number
  target_horizon: 'monthly' | 'annual'
  holdings_tickers: string[]
  is_new_portfolio?: boolean
}

const SYSTEM_PROMPT =
  'You are a market sentiment analyst specializing in retail and institutional investor behavior. ' +
  'Analyze the news headlines provided and assess the current market mood and its implications for a US stock portfolio. ' +
  'Focus on: the CNN Fear & Greed index direction and what headlines imply about it, ' +
  'retail investor positioning signals (meme activity, put/call ratios, AAII survey sentiment), ' +
  'institutional flows (hedge fund positioning, fund flows into/out of equities), ' +
  'earnings season expectations versus reality (beats, misses, guidance cuts), ' +
  'and S&P 500 risk appetite (whether the market is in risk-on or risk-off mode). ' +
  'Explicitly assess whether current sentiment conditions support the risk-on exposure needed ' +
  'to achieve the investor\'s target return (see portfolio context), or whether sentiment-driven ' +
  'drawdown risk could derail it. Conclude with a direct statement on this. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runSentimentAgent(input: SentimentAgentInput): Promise<AgentRunResult> {
  const articles = await fetchSentimentArticles()

  const articleContent = articles.length === 0
    ? 'No recent market sentiment news articles found.'
    : articles
        .map(a => `- ${a.title}: ${a.description ?? 'No description.'}`)
        .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    describeTickers(input.holdings_tickers, input.is_new_portfolio)

  const userContent = `Recent market sentiment headlines:\n${articleContent}${portfolioContext}`

  const { text, stopReason, usage } = await callClaude({
    role:   'agent',
    name:   'sentiment',
    system: withIslamicMandate(SYSTEM_PROMPT),
    user:   userContent,
  })

  return { output: parseAgentResponse(text, stopReason), usage }
}
