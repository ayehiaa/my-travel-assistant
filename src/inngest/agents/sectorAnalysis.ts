import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import type { PriceHistory } from '@/inngest/dataSources/polygon'
import type { TickerDetailsMap } from '@/inngest/dataSources/polygon'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface SectorAnalysisAgentInput {
  risk_profile:      string
  target_return_pct: number
  target_horizon:    'monthly' | 'annual'
  holdings_tickers:  string[]
  priceData:         PriceHistory
  tickerDetails:     TickerDetailsMap
}

const SYSTEM_PROMPT =
  'You are a sector analysis specialist focused on portfolio concentration, sector rotation, and diversification for US equities. ' +
  'Analyze the sector composition of the portfolio provided and assess the risk and opportunity by sector. ' +
  'Focus on: sector concentration risk — identify sectors that are over-weight or under-weight relative to typical S&P 500 sector weights; ' +
  'rotation signals — identify which sectors are showing relative strength versus weakness based on recent price trends; ' +
  'diversification recommendations — highlight gaps or excessive concentrations and suggest rebalancing; ' +
  'and alignment with risk profile — assess whether the current sector mix is appropriate for the stated risk profile and target return. ' +
  'Explicitly assess whether the current sector allocation is likely to generate returns consistent with the investor\'s target (see portfolio context). ' +
  'Name any specific sector rotation — overweighting or underweighting a sector — that would materially improve the probability of hitting the target. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runSectorAnalysisAgent(
  input: SectorAnalysisAgentInput,
): Promise<AgentOutput> {
  // Group tickers by sic_description
  const sectorMap: Record<string, string[]> = {}
  for (const ticker of input.holdings_tickers) {
    const detail = input.tickerDetails[ticker]
    const sector = detail?.sic_description ?? 'Unknown'
    if (!sectorMap[sector]) {
      sectorMap[sector] = []
    }
    sectorMap[sector].push(ticker)
  }

  const sectorLines = Object.entries(sectorMap).map(([sector, tickers]) => {
    const tickerLines = tickers.map(ticker => {
      const detail  = input.tickerDetails[ticker]
      const name    = detail?.name ?? ticker
      const candles = input.priceData[ticker]
      if (!candles || candles.length === 0) {
        return `  - ${ticker} (${name}): no price data`
      }
      const latest       = candles[candles.length - 1]
      const earliest     = candles[0]
      const returnPct    = ((latest.close - earliest.close) / earliest.close * 100).toFixed(2)
      return `  - ${ticker} (${name}): latest close $${latest.close.toFixed(2)}, 30-day return ${returnPct}%`
    })
    return `Sector: ${sector}\n${tickerLines.join('\n')}`
  })

  const sectorContext = sectorLines.length === 0
    ? 'No sector data available.'
    : sectorLines.join('\n\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent =
    `Sector composition of portfolio holdings:\n\n${sectorContext}${portfolioContext}`

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
