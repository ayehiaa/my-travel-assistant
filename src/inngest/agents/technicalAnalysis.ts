import type { AgentRunResult } from '@/inngest/agents/types'
import { callClaude } from '@/lib/aiCall'
import { parseAgentResponse } from '@/lib/aiResponse'
import type { PriceHistory } from '@/inngest/dataSources/polygon'
import { withIslamicMandate } from '@/lib/islamicMandate'
import type { EffectiveScreeningConfig } from '@/lib/screeningConfig'
import { describeTickers } from '@/inngest/agents/portfolioContext'

export interface TechnicalAnalysisAgentInput {
  risk_profile:      string
  target_return_pct: number
  target_horizon:    'monthly' | 'annual'
  holdings_tickers:  string[]
  is_new_portfolio?: boolean
  /** Effective screening config (specs/030); missing → full Islamic screening. */
  screening?: EffectiveScreeningConfig
  /** The run owner's Anthropic API key (resolved inside the Inngest step; never stored). */
  apiKey: string
  priceData:         PriceHistory
}

const SYSTEM_PROMPT =
  'You are a technical analysis specialist focused on price action and chart patterns for US equities. ' +
  'Analyze the 30-day OHLCV price data provided and assess the technical outlook for the portfolio holdings. ' +
  'Focus on: trend direction — whether each stock is making higher highs and higher lows (uptrend) or lower highs and lower lows (downtrend); ' +
  'simple moving average relationship — whether the latest close is above or below the 30-day average close (bullish or bearish bias); ' +
  'momentum — compare the average close of the most recent 5 days versus the earliest 5 days to determine if momentum is accelerating or decelerating; ' +
  'and support and resistance — use the 30-day high and low as key reference levels for potential reversals or breakouts. ' +
  'Explicitly compute and state the aggregate 30-day price return across the portfolio holdings (weighted by position size if possible) ' +
  'and compare it to the investor\'s target return (see portfolio context). ' +
  'State whether current price momentum is tracking ahead of, in line with, or behind the target. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runTechnicalAnalysisAgent(
  input: TechnicalAnalysisAgentInput,
): Promise<AgentRunResult> {
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
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    describeTickers(input.holdings_tickers, input.is_new_portfolio)

  const userContent =
    `30-day OHLCV price data for portfolio holdings:\n${priceContext}${portfolioContext}`

  const { text, stopReason, usage } = await callClaude({
    role:   'agent',
    name:   'technical_analysis',
    system: withIslamicMandate(SYSTEM_PROMPT, input.screening),
    user:   userContent,
    apiKey: input.apiKey,
  })

  return { output: parseAgentResponse(text, stopReason), usage }
}
