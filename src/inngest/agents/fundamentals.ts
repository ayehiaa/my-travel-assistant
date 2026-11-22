import type { AgentRunResult } from '@/inngest/agents/types'
import { callClaude } from '@/lib/aiCall'
import { parseAgentResponse } from '@/lib/aiResponse'
import { fetchEdgarFilings } from '@/inngest/dataSources/edgar'
import { withIslamicMandate } from '@/lib/islamicMandate'
import type { EffectiveScreeningConfig } from '@/lib/screeningConfig'
import { describeTickers } from '@/inngest/agents/portfolioContext'

export interface FundamentalsAgentInput {
  risk_profile:      string
  target_return_pct: number
  target_horizon:    'monthly' | 'annual'
  holdings_tickers:  string[]
  is_new_portfolio?: boolean
  /** Effective screening config (specs/030); missing → full Islamic screening. */
  screening?: EffectiveScreeningConfig
  /** The run owner's Anthropic API key (resolved inside the Inngest step; never stored). */
  apiKey: string
}

const SYSTEM_PROMPT =
  'You are a fundamental equity analyst specializing in SEC filing analysis for US public companies. ' +
  'Analyze the SEC filing data provided and assess the fundamental health and earnings trajectory of the portfolio holdings. ' +
  'Focus on: revenue and earnings trends indicated by recent 10-K annual and 10-Q quarterly filings, ' +
  'balance sheet signals (debt levels, cash position changes visible from filing frequency and dates), ' +
  'recency of filings as a governance and transparency signal, ' +
  'companies with missing or delayed filings as a risk flag, ' +
  'and whether the overall fundamental picture supports or contradicts a bullish portfolio stance. ' +
  'Explicitly assess whether the earnings and revenue trajectory of the holdings is consistent with ' +
  'generating the investor\'s target return (see portfolio context). Flag any holdings whose fundamentals ' +
  'are too weak to justify their allocation if the target is to be met. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) ' +
  'with exactly three fields: "analysis" (200–400 word string), ' +
  '"confidence" ("low" | "medium" | "high"), and "stance" ("bullish" | "bearish" | "neutral").'

export async function runFundamentalsAgent(input: FundamentalsAgentInput): Promise<AgentRunResult> {
  const filings = await fetchEdgarFilings(input.holdings_tickers)

  const articleContent = filings.length === 0
    ? 'No recent SEC filings found for portfolio holdings.'
    : filings
        .map(f => `- ${f.ticker} (${f.companyName}): ${f.formType} filed ${f.filingDate}, accession ${f.accessionNumber}`)
        .join('\n')

  const portfolioContext =
    `\nPortfolio context:\n` +
    `Risk profile: ${input.risk_profile}\n` +
    `Target return: ${input.target_return_pct}% ${input.target_horizon === 'annual' ? 'annually' : 'per month'}\n` +
    describeTickers(input.holdings_tickers, input.is_new_portfolio)

  const userContent = `Recent SEC filings:\n${articleContent}${portfolioContext}`

  const { text, stopReason, usage } = await callClaude({
    role:   'agent',
    name:   'fundamentals',
    system: withIslamicMandate(SYSTEM_PROMPT, input.screening),
    user:   userContent,
    apiKey: input.apiKey,
  })

  return { output: parseAgentResponse(text, stopReason), usage }
}
