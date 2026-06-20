import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import { fetchFedRatesData } from '@/inngest/dataSources/fred'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface FedRatesAgentInput {
  risk_profile: string
  target_return_pct: number
  target_horizon: 'monthly' | 'annual'
  holdings_tickers: string[]
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

export async function runFedRatesAgent(input: FedRatesAgentInput): Promise<AgentOutput> {
  const seriesData = await fetchFedRatesData()

  const indicatorLines = seriesData
    .map(s => `${s.title} (${s.unit}): latest ${s.latest_value !== null ? s.latest_value : 'N/A'}`)
    .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent = `Interest rate indicators:\n${indicatorLines}${portfolioContext}`

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
