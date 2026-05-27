import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import { fetchSentimentArticles } from '@/inngest/dataSources/newsapi'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface SentimentAgentInput {
  risk_profile: string
  target_return_pct: number
  holdings_tickers: string[]
}

const SYSTEM_PROMPT =
  'You are a market sentiment analyst specializing in retail and institutional investor behavior. ' +
  'Analyze the news headlines provided and assess the current market mood and its implications for a US stock portfolio. ' +
  'Focus on: the CNN Fear & Greed index direction and what headlines imply about it, ' +
  'retail investor positioning signals (meme activity, put/call ratios, AAII survey sentiment), ' +
  'institutional flows (hedge fund positioning, fund flows into/out of equities), ' +
  'earnings season expectations versus reality (beats, misses, guidance cuts), ' +
  'and S&P 500 risk appetite (whether the market is in risk-on or risk-off mode). ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runSentimentAgent(input: SentimentAgentInput): Promise<AgentOutput> {
  const articles = await fetchSentimentArticles()

  const articleContent = articles.length === 0
    ? 'No recent market sentiment news articles found.'
    : articles
        .map(a => `- ${a.title}: ${a.description ?? 'No description.'}`)
        .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}%\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent = `Recent market sentiment headlines:\n${articleContent}${portfolioContext}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 800,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userContent }],
  })

  const block = response.content[0]
  const text = block.type === 'text' ? block.text : ''

  try {
    const result = AgentOutputSchema.safeParse(JSON.parse(text))
    return result.success ? result.data : { analysis: text, confidence: 'low', stance: 'neutral' }
  } catch {
    return { analysis: text, confidence: 'low', stance: 'neutral' }
  }
}
