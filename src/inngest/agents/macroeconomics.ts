import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import { fetchFredData } from '@/inngest/dataSources/fred'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface MacroAgentInput {
  risk_profile: string
  target_return_pct: number
  target_horizon: 'monthly' | 'annual'
  holdings_tickers: string[]
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

export async function runMacroeconomicsAgent(input: MacroAgentInput): Promise<AgentOutput> {
  const seriesData = await fetchFredData()

  const indicatorLines = seriesData
    .map(s => `${s.title} (${s.unit}): latest ${s.latest_value !== null ? s.latest_value : 'N/A'}`)
    .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent = `Economic indicators:\n${indicatorLines}${portfolioContext}`

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
