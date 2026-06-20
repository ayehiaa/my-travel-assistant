import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput } from '@/types/database'
import { fetchEdgarFilings } from '@/inngest/dataSources/edgar'

const AgentOutputSchema = z.object({
  analysis:   z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  stance:     z.enum(['bullish', 'bearish', 'neutral']),
})

export interface FundamentalsAgentInput {
  risk_profile:      string
  target_return_pct: number
  target_horizon:    'monthly' | 'annual'
  holdings_tickers:  string[]
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

export async function runFundamentalsAgent(input: FundamentalsAgentInput): Promise<AgentOutput> {
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
    `Holdings: ${input.holdings_tickers.join(', ')}`

  const userContent = `Recent SEC filings:\n${articleContent}${portfolioContext}`

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
