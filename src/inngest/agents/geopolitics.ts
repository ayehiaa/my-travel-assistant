import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import { fetchGeopoliticsArticles } from '@/inngest/dataSources/newsapi'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface GeopoliticsAgentInput {
  risk_profile: string
  target_return_pct: number
  holdings_tickers: string[]
}

const SYSTEM_PROMPT =
  'You are a geopolitical risk analyst specializing in the impact of global events on US equities. ' +
  'Analyze the news headlines provided and assess the implications for a US stock portfolio. ' +
  'Focus on: trade policy shifts (tariffs, sanctions, export controls), ' +
  'election outcomes and political transitions, ' +
  'regional conflicts and their supply chain / energy effects, ' +
  'and central bank coordination signals. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runGeopoliticsAgent(input: GeopoliticsAgentInput): Promise<AgentOutput> {
  const articles = await fetchGeopoliticsArticles()

  const articleContent = articles.length === 0
    ? 'No recent geopolitical news articles found.'
    : articles
        .map(a => `- ${a.title}: ${a.description ?? 'No description.'}`)
        .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}%\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent = `Recent geopolitical headlines:\n${articleContent}${portfolioContext}`

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
