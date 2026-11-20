import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput, PortfolioSnapshot, PortfolioSettings, TargetAllocationItem } from '@/types/database'
import type { PortfolioReturnMetrics } from '@/lib/portfolioCalculator'
import { withIslamicMandate } from '@/lib/islamicMandate'
import { MAX_STOCK_WEIGHT_PCT } from '@/lib/shariahRules'

export interface SynthesizerParams {
  agentOutputs:    Record<string, AgentOutput>
  snapshot:        PortfolioSnapshot
  settings:        PortfolioSettings
  recentSummaries: string[]
  returnMetrics:   PortfolioReturnMetrics
  /** True when the account holds only cash — build a portfolio instead of rebalancing one. */
  isNewPortfolio?:   boolean
  /** Starter candidates the agents researched (new portfolio only). */
  candidateTickers?: string[]
}

export interface SynthesizerOutput {
  target_allocation: TargetAllocationItem[]
  summary_text: string
  conflict_notes: string
}

const SynthesisSchema = z.object({
  target_allocation: z
    .array(
      z.object({
        ticker:     z.string(),
        target_pct: z.number(),
        rationale:  z.string(),
      })
    )
    .refine(
      items => {
        const sum = items.reduce((s, i) => s + i.target_pct, 0)
        return sum >= 99.5 && sum <= 100.5
      },
      { message: 'Allocation must sum to 100%' }
    ),
  summary_text:   z.string(),
  conflict_notes: z.string(),
})

const OUTPUT_HEADER =
  'You are a senior portfolio strategist synthesizing analysis from multiple specialised agents ' +
  'into a unified investment recommendation. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: ' +
  '"target_allocation" (array of { ticker, target_pct, rationale }), ' +
  '"summary_text" (100–200 word overall assessment string), ' +
  '"conflict_notes" (1–2 sentence summary of key agent disagreements, or empty string if none).\n\n'

const TICKER_RULES =
  '  1. Use only real, valid US-traded ticker symbols of individual common stocks (e.g. "MSFT", "AAPL"). ' +
  'Never use ETFs, funds, bonds or preferred shares.\n' +
  '  2. Never invent tickers or use sector labels as tickers (e.g. "Tech_Stocks" is invalid).\n'

function buildNewPortfolioPrompt(
  settings:         PortfolioSettings,
  snapshot:         PortfolioSnapshot,
  candidateTickers: string[],
): string {
  const horizonLabel = settings.target_horizon === 'annual' ? 'annually' : 'per month'
  return (
    OUTPUT_HEADER +
    `Risk profile: ${settings.risk_profile}\n` +
    `Target return: ${settings.target_return_pct}% ${horizonLabel}\n\n` +
    '--- NEW PORTFOLIO ---\n' +
    'The account holds no positions yet. You are BUILDING a first portfolio from cash, not rebalancing one.\n' +
    `Cash available to invest: $${snapshot.cash_usd.toFixed(2)}\n` +
    `Candidate stocks the agents researched: ${candidateTickers.join(', ')}\n\n` +
    'Construction rules:\n' +
    `  - Allocate across 6–10 individual Shariah-compliant common stocks sized for the risk profile; no single stock may exceed ${MAX_STOCK_WEIGHT_PCT}%.\n` +
    '  - No ETFs, funds, bonds or preferred shares — diversify across sectors with individual stocks instead.\n' +
    '  - Prefer the researched candidates, but you may use other valid US-listed common stocks if the agent analysis supports it.\n' +
    '  - Orders are whole shares, so very small positions may not be executable for small accounts.\n' +
    '  - There is no performance history yet: do not describe a performance gap; explain how the allocation is ' +
    'positioned to reach the target return.\n\n' +
    'IMPORTANT ticker rules — all tickers in target_allocation must follow these rules:\n' +
    TICKER_RULES +
    '  3. All recommended tickers will be validated against market data — invalid tickers will be stripped.\n\n' +
    'Output format — return a JSON object with exactly these three keys:\n' +
    '  target_allocation: array of { ticker: string, target_pct: number, rationale: string } ' +
    '(percentages must sum to 100%; rationale max 20 words per ticker)\n' +
    '  summary_text: string (100–200 word overall assessment of the new portfolio and why it fits the risk profile and target)\n' +
    '  conflict_notes: string (1–2 sentences on agent disagreements, or "" if none)'
  )
}

function buildSystemPrompt(
  settings:      PortfolioSettings,
  snapshot:      PortfolioSnapshot,
  returnMetrics: PortfolioReturnMetrics,
): string {
  const holdingsText   = snapshot.holdings
    .map(h => `  ${h.ticker} (${h.company_name}): $${h.total_value_usd.toFixed(2)}`)
    .join('\n')

  const horizonLabel   = settings.target_horizon === 'annual' ? 'annually' : 'per month'
  const gapLabel       = returnMetrics.annual_gap_pct >= 0
    ? `+${returnMetrics.annual_gap_pct.toFixed(2)}% (outperforming)`
    : `${returnMetrics.annual_gap_pct.toFixed(2)}% (underperforming — must close this gap)`
  const coverageNote   = returnMetrics.data_coverage_pct < 80
    ? ` (note: only ${returnMetrics.data_coverage_pct}% of portfolio value has price data — treat with caution)`
    : ''

  return (
    OUTPUT_HEADER +
    `Risk profile: ${settings.risk_profile}\n` +
    `Target return: ${settings.target_return_pct}% ${horizonLabel}\n\n` +
    'Current portfolio holdings:\n' +
    holdingsText + '\n' +
    `Cash: $${snapshot.cash_usd.toFixed(2)}\n` +
    `Total portfolio value: $${snapshot.total_value_usd.toFixed(2)}\n\n` +
    '--- PERFORMANCE VS TARGET ---\n' +
    `  30-day weighted return:  ${returnMetrics.weighted_30d_return_pct.toFixed(2)}%${coverageNote}\n` +
    `  Annualised equivalent:   ${returnMetrics.annualized_return_pct.toFixed(2)}%\n` +
    `  Target (annualised):     ${returnMetrics.target_annual_pct.toFixed(2)}%\n` +
    `  Gap:                     ${gapLabel}\n\n` +
    'IMPORTANT — your allocation MUST address this gap:\n' +
    (returnMetrics.annual_gap_pct < 0
      ? `  The portfolio is ${Math.abs(returnMetrics.annual_gap_pct).toFixed(2)}% behind its annualised target. ` +
        'Overweight instruments with stronger growth profiles or introduce new higher-return instruments. ' +
        'Reduce or eliminate positions whose recent momentum is too weak to contribute to the target.\n\n'
      : `  The portfolio is ahead of its target. Assess whether to maintain positioning or reduce risk ` +
        'to lock in gains while preserving the ability to stay on target.\n\n') +
    'You may recommend new individual Shariah-compliant common stocks not currently in the portfolio if they would help close the gap. ' +
    `No single stock may exceed ${MAX_STOCK_WEIGHT_PCT}% of the portfolio. Holdings that are ETFs, funds, bonds or otherwise non-compliant should be given 0%.\n` +
    'IMPORTANT ticker rules — all tickers in target_allocation must follow these rules:\n' +
    TICKER_RULES +
    '  3. Limit new additions to a maximum of 3 new instruments per recommendation.\n' +
    '  4. All recommended tickers will be validated against market data — invalid tickers will be stripped.\n\n' +
    'Output format — return a JSON object with exactly these three keys:\n' +
    '  target_allocation: array of { ticker: string, target_pct: number, rationale: string } ' +
    '(percentages must sum to 100%; rationale max 20 words per ticker)\n' +
    '  summary_text: string (100–200 word overall assessment; must mention the performance gap and how the allocation addresses it)\n' +
    '  conflict_notes: string (1–2 sentences on agent disagreements, or "" if none)'
  )
}

function buildUserPrompt(
  agentOutputs:    Record<string, AgentOutput>,
  recentSummaries: string[]
): string {
  const parts: string[] = []

  if (recentSummaries.length > 0) {
    for (const summary of recentSummaries) {
      parts.push(`[PAST CONTEXT]\n${summary}\n`)
    }
  }

  for (const [agentKey, output] of Object.entries(agentOutputs)) {
    parts.push(
      `[AGENT: ${agentKey}]\n` +
      `Stance: ${output.stance} | Confidence: ${output.confidence}\n` +
      `Analysis: ${output.analysis}`
    )
  }

  return parts.join('\n\n')
}

export async function runSynthesizer(params: SynthesizerParams): Promise<SynthesizerOutput> {
  const { agentOutputs, snapshot, settings, recentSummaries, returnMetrics, isNewPortfolio, candidateTickers } = params

  const systemPrompt = withIslamicMandate(isNewPortfolio
    ? buildNewPortfolioPrompt(settings, snapshot, candidateTickers ?? [])
    : buildSystemPrompt(settings, snapshot, returnMetrics))

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 3000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: buildUserPrompt(agentOutputs, recentSummaries) }],
  })

  const block = response.content[0]
  const raw = block.type === 'text' ? block.text : ''
  // Extract the JSON object regardless of surrounding prose or code fences
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Synthesizer returned no JSON object')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Synthesizer returned malformed JSON')
  }

  const validationResult = SynthesisSchema.safeParse(parsed)
  if (!validationResult.success) {
    const messages = validationResult.error.issues.map(i => i.message).join('; ')
    throw new Error(`Synthesizer output failed schema validation: ${messages}`)
  }
  const validated = validationResult.data

  return {
    target_allocation: validated.target_allocation,
    summary_text:      validated.summary_text,
    conflict_notes:    validated.conflict_notes,
  }
}
