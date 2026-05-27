import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import type { PriceHistory } from '@/inngest/dataSources/polygon'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface TechnicalAnalysisAgentInput {
  risk_profile:      string
  target_return_pct: number
  holdings_tickers:  string[]
  priceData:         PriceHistory
}

const SYSTEM_PROMPT =
  'You are a technical analysis specialist focused on price action and chart patterns for US equities. ' +
  'Analyze the 30-day OHLCV price data provided and assess the technical outlook for the portfolio holdings. ' +
  'Focus on: trend direction — whether each stock is making higher highs and higher lows (uptrend) or lower highs and lower lows (downtrend); ' +
  'simple moving average relationship — whether the latest close is above or below the 30-day average close (bullish or bearish bias); ' +
  'momentum — compare the average close of the most recent 5 days versus the earliest 5 days to determine if momentum is accelerating or decelerating; ' +
  'and support and resistance — use the 30-day high and low as key reference levels for potential reversals or breakouts. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runTechnicalAnalysisAgent(
  input: TechnicalAnalysisAgentInput,
): Promise<AgentOutput> {
  const tickersWithData = input.holdings_tickers.filter(
    ticker => (input.priceData[ticker]?.length ?? 0) > 0,
  )

  const priceContext = tickersWithData.length === 0
    ? 'No price data available for portfolio holdings.'
    : tickersWithData
        .map(ticker => {
          const candles = input.priceData[ticker]
          const latest  = candles[candles.length - 1]
          const low30   = Math.min(...candles.map(c => c.low))
          const high30  = Math.max(...candles.map(c => c.high))
          return `- ${ticker}: ${candles.length} candles, latest close $${latest.close.toFixed(2)}, 30-day range $${low30.toFixed(2)}–$${high30.toFixed(2)}`
        })
        .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}%\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent =
    `30-day OHLCV price data for portfolio holdings:\n${priceContext}${portfolioContext}`

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
