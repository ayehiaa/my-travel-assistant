import { z } from 'zod'
import type { AgentOutput, PortfolioSnapshot, PortfolioSettings, TargetAllocationItem } from '@/types/database'
import { ANNUALISE_MIN_DAYS, MIN_HISTORY_DAYS, describeTarget, type HoldingMomentum, type RealReturnMetrics } from '@/lib/returnMetrics'
import { extractCashEntries, normaliseWithCash } from '@/lib/cashAllocation'
import { withIslamicMandate } from '@/lib/islamicMandate'
import { FULL_SCREENING_CONFIG, type EffectiveScreeningConfig } from '@/lib/screeningConfig'
import { MAX_STOCK_WEIGHT_PCT } from '@/lib/shariahRules'
import { callClaude } from '@/lib/aiCall'
import { assertCompleteResponse } from '@/lib/aiResponse'
import type { AiCallUsage } from '@/lib/aiCost'

export interface SynthesizerParams {
  agentOutputs:    Record<string, AgentOutput>
  snapshot:        PortfolioSnapshot
  settings:        PortfolioSettings
  recentSummaries: string[]
  /** Real account return vs target (Alpaca portfolio history) — the target verdict. */
  returnMetrics:   RealReturnMetrics
  /** Recent price change of each current holding — input only (which positions are weak / strong). */
  holdingMomentum?: { rows: HoldingMomentum[]; coverage_pct: number }
  /** True when the account holds only cash — build a portfolio instead of rebalancing one. */
  isNewPortfolio?:   boolean
  /** Starter candidates the agents researched (new portfolio only). */
  candidateTickers?: string[]
  /** The run owner's Anthropic API key (resolved inside the Inngest step; never stored). */
  apiKey: string
  /** Effective screening config (specs/030); missing → full Islamic screening + stocks only. */
  screening?: EffectiveScreeningConfig
}

export interface SynthesizerOutput {
  /** Stocks only — reserved cash words have been converted into cash_target_pct. Σ target_pct + cash = 100. */
  target_allocation: TargetAllocationItem[]
  /** Share of the account to keep in cash (0–100). Absent on results memoised before specs/031 → 0. */
  cash_target_pct?: number
  /** Reserved-word entries the model put into target_allocation (converted into cash). */
  cash_converted?: string[]
  summary_text: string
  conflict_notes: string
}

export interface SynthesizerRunResult {
  result: SynthesizerOutput
  usage: AiCallUsage
}

export const SynthesisSchema = z.object({
  target_allocation: z.array(
    z.object({
      ticker:     z.string(),
      target_pct: z.number(),
      rationale:  z.string(),
    })
  ),
  cash_target_pct: z.number().min(0).max(100).optional().default(0),
  summary_text:   z.string(),
  conflict_notes: z.string(),
}).refine(
  o => {
    const sum = o.target_allocation.reduce((s, i) => s + i.target_pct, 0) + o.cash_target_pct
    // Rounding / small arithmetic slips are normalised below; only a clearly wrong total fails.
    return sum >= 90 && sum <= 110
  },
  { message: 'Allocation plus cash must sum to roughly 100% (90–110%)' }
)

/**
 * Turn the validated synthesizer JSON into the stored shape: reserved cash words → cash, zero weights dropped,
 * stocks + cash normalised to exactly 100. Pure; exported for tests.
 */
export function finaliseSynthesis(validated: z.infer<typeof SynthesisSchema>): SynthesizerOutput {
  const extracted = extractCashEntries(validated.target_allocation, validated.cash_target_pct)
  const converted = validated.target_allocation.filter(a => !extracted.stocks.includes(a)).map(a => a.ticker)
  const normalised = normaliseWithCash(extracted.stocks, extracted.cash_target_pct)
  return {
    target_allocation: normalised.stocks,
    cash_target_pct:   normalised.cash_target_pct,
    cash_converted:    converted,
    summary_text:      validated.summary_text,
    conflict_notes:    validated.conflict_notes,
  }
}

const OUTPUT_HEADER =
  'You are a senior portfolio strategist synthesizing analysis from multiple specialised agents ' +
  'into a unified investment recommendation. ' +
  'Return ONLY a raw JSON object (no markdown, no code fences) with exactly four fields: ' +
  '"target_allocation" (array of { ticker, target_pct, rationale }), ' +
  '"cash_target_pct" (number 0–100: share of the account to keep in cash), ' +
  '"summary_text" (100–200 word overall assessment string), ' +
  '"conflict_notes" (1–2 sentence summary of key agent disagreements, or empty string if none).\n\n'

/** How to use cash (specs/031). Exported for tests. */
export const CASH_RULES =
  'CASH — cash is held explicitly in "cash_target_pct", NEVER as a ticker:\n' +
  '  - Never put "CASH", "USD", "$", a money-market fund or a sweep fund in target_allocation (note: CASH is also a ' +
  'real bank stock — writing it as a ticker would be wrong either way).\n' +
  '  - Holding some cash makes sense when nothing compliant is attractive enough, when risk limits or concentration ' +
  'call for it, or when uncertainty is high. Otherwise keep cash_target_pct low (0 is fine) — idle cash earns nothing ' +
  'towards the target.\n' +
  '  - The stock target_pct values plus cash_target_pct must sum to 100.\n\n'

const OUTPUT_FORMAT_ALLOCATION =
  '  target_allocation: array of { ticker: string, target_pct: number, rationale: string } ' +
  '(stocks only; rationale max 20 words per ticker)\n' +
  '  cash_target_pct: number (0–100; stocks + cash_target_pct must sum to 100%)\n'

const TICKER_RULES =
  '  1. Use only real, valid US-traded ticker symbols of individual common stocks (e.g. "MSFT", "AAPL"). ' +
  'Never use ETFs, funds, bonds or preferred shares.\n' +
  '  2. Never invent tickers or use sector labels as tickers (e.g. "Tech_Stocks" is invalid).\n'

const TICKER_RULES_ANY_SECURITY =
  '  1. Use only real, valid US-traded ticker symbols (e.g. "MSFT", "AAPL", or a listed ETF). Never use bonds or preferred shares.\n' +
  '  2. Never invent tickers or use sector labels as tickers (e.g. "Tech_Stocks" is invalid).\n'

/** Wording that depends on the screening config (specs/030). Full config = the spec-019 wording. Pure; exported for tests. */
export function synthesizerWording(cfg: EffectiveScreeningConfig): {
  tickerRules: string
  newPortfolioRules: string
  newHoldingsLine: string
} {
  const compliant = cfg.islamic ? 'Shariah-compliant ' : ''
  if (cfg.stocks_only) {
    return {
      tickerRules: TICKER_RULES,
      newPortfolioRules:
        `  - Allocate across 6–10 individual ${compliant}common stocks sized for the risk profile; no single stock may exceed ${MAX_STOCK_WEIGHT_PCT}%.\n` +
        '  - No ETFs, funds, bonds or preferred shares — diversify across sectors with individual stocks instead.\n',
      newHoldingsLine:
        `You may recommend new individual ${compliant}common stocks not currently in the portfolio if they would help close the gap. ` +
        `No single stock may exceed ${MAX_STOCK_WEIGHT_PCT}% of the portfolio. Holdings that are ETFs, funds, bonds or otherwise ` +
        `${cfg.islamic ? 'non-compliant' : 'not individual common stocks'} should be given 0%.\n`,
    }
  }
  return {
    tickerRules: TICKER_RULES_ANY_SECURITY,
    newPortfolioRules:
      `  - Allocate across 6–10 ${compliant}positions sized for the risk profile; no single position may exceed ${MAX_STOCK_WEIGHT_PCT}%.\n` +
      '  - Prefer individual common stocks; a broad ETF is allowed. No bonds or preferred shares.\n',
    newHoldingsLine:
      `You may recommend new ${compliant}stocks or ETFs not currently in the portfolio if they would help close the gap. ` +
      `No single position may exceed ${MAX_STOCK_WEIGHT_PCT}% of the portfolio.` +
      (cfg.islamic ? ' Holdings that are non-compliant should be given 0%.\n' : '\n'),
  }
}

function buildNewPortfolioPrompt(
  settings:         PortfolioSettings,
  snapshot:         PortfolioSnapshot,
  candidateTickers: string[],
  cfg:              EffectiveScreeningConfig,
): string {
  const wording = synthesizerWording(cfg)
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
    wording.newPortfolioRules +
    `  - Prefer the researched candidates, but you may use other valid US-listed ${cfg.stocks_only ? 'common stocks' : 'securities'} if the agent analysis supports it.\n` +
    '  - Orders are whole shares, so very small positions may not be executable for small accounts.\n' +
    '  - There is no performance history yet: do not describe a performance gap; explain how the allocation is ' +
    'positioned to reach the target return.\n\n' +
    'IMPORTANT ticker rules — all tickers in target_allocation must follow these rules:\n' +
    wording.tickerRules +
    '  3. All recommended tickers will be validated against market data — invalid tickers will be stripped.\n\n' +
    CASH_RULES +
    'Output format — return a JSON object with exactly these four keys:\n' +
    OUTPUT_FORMAT_ALLOCATION +
    '  summary_text: string (100–200 word overall assessment of the new portfolio and why it fits the risk profile and target)\n' +
    '  conflict_notes: string (1–2 sentences on agent disagreements, or "" if none)'
  )
}

function signed(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

/**
 * The "PERFORMANCE VS TARGET" section from the REAL account return (time-weighted, deposits excluded), plus the
 * per-holding momentum clearly labelled as an input only. Pure; exported for tests.
 */
export function buildPerformanceSection(
  m: RealReturnMetrics,
  momentum?: { rows: HoldingMomentum[]; coverage_pct: number },
): string {
  let text = '--- PERFORMANCE VS TARGET (real account return from the broker; time-weighted, deposits/withdrawals excluded) ---\n'
  if (m.status !== 'ok' || m.period_return_pct === null || m.gap_pct === null) {
    text +=
      (m.status === 'unavailable'
        ? `  Account return history is unavailable right now (${m.reason ?? 'unknown reason'}).\n`
        : `  Insufficient history: ${m.reason ?? `fewer than ${MIN_HISTORY_DAYS} days.`} ` +
          `A reliable verdict needs at least ${MIN_HISTORY_DAYS} days since the programme started.\n`) +
      `  Target: ${m.target_annual_pct.toFixed(2)}% a year (compounded).\n\n` +
      'IMPORTANT — there is no reliable performance gap yet. Do NOT claim the portfolio is ahead of or behind its target. ' +
      'Focus on building / maintaining the target mix that fits the risk profile and is positioned to reach the target ' +
      'return over time; avoid chasing short-term moves.\n\n'
  } else {
    const period = `${m.start_date} to ${m.end_date} (${Math.round(m.days)} days, ` +
      `${m.window === 'programme_start' ? 'since the programme started' : 'last 3 months'})`
    const behind = m.gap_pct < 0
    text += `  Period:                  ${period}\n` +
      `  Period return:           ${signed(m.period_return_pct)}` +
      (m.method === 'equity' ? ' (equity change only — may include deposits/withdrawals; treat with caution)' : '') + '\n'
    if (m.basis === 'annualised' && m.annualised_return_pct !== null) {
      text +=
        `  Annualised (compounded): ${signed(m.annualised_return_pct)}\n` +
        `  Target (annual):         ${m.target_annual_pct.toFixed(2)}%\n` +
        `  Gap (annualised):        ${signed(m.gap_pct)} (${behind ? 'behind target' : 'ahead of target'})\n\n`
    } else {
      text +=
        `  Target for this period:  ${describeTarget(m)}\n` +
        `  Gap (period):            ${signed(m.gap_pct)} (${behind ? 'behind target' : 'ahead of target'}; ` +
        `window under ${ANNUALISE_MIN_DAYS} days, so it is compared unannualised)\n\n`
    }
    text += 'IMPORTANT — your allocation MUST address this gap:\n' +
      (behind
        ? `  The portfolio is ${Math.abs(m.gap_pct).toFixed(2)} points behind its target. ` +
          'Overweight instruments with stronger growth profiles or introduce new higher-return instruments. ' +
          'Reduce or eliminate positions whose recent momentum is too weak to contribute to the target.\n\n'
        : '  The portfolio is ahead of its target. Assess whether to maintain positioning or reduce risk ' +
          'to lock in gains while preserving the ability to stay on target.\n\n')
  }

  if (momentum && momentum.rows.length > 0) {
    text += '--- RECENT PER-HOLDING PRICE CHANGE (~30 days, current holdings only) ---\n' +
      'Input only, to see which positions are weak or strong — NOT the performance verdict (it ignores cash, sold ' +
      'positions and timing).' +
      (momentum.coverage_pct < 80 ? ` Covers only ${momentum.coverage_pct}% of holdings value.` : '') + '\n' +
      momentum.rows.map(r => `  ${r.ticker}: ${signed(r.return_pct)} (weight ${r.weight_pct.toFixed(1)}% of holdings)`).join('\n') +
      '\n\n'
  }
  return text
}

function buildSystemPrompt(
  settings:      PortfolioSettings,
  snapshot:      PortfolioSnapshot,
  returnMetrics: RealReturnMetrics,
  momentum:      { rows: HoldingMomentum[]; coverage_pct: number } | undefined,
  cfg:           EffectiveScreeningConfig,
): string {
  const wording = synthesizerWording(cfg)
  const holdingsText   = snapshot.holdings
    .map(h => `  ${h.ticker} (${h.company_name}): $${h.total_value_usd.toFixed(2)}`)
    .join('\n')

  const horizonLabel   = settings.target_horizon === 'annual' ? 'annually' : 'per month'
  const hasGap = returnMetrics.status === 'ok' && returnMetrics.gap_pct !== null

  return (
    OUTPUT_HEADER +
    `Risk profile: ${settings.risk_profile}\n` +
    `Target return: ${settings.target_return_pct}% ${horizonLabel}\n\n` +
    'Current portfolio holdings:\n' +
    holdingsText + '\n' +
    `Cash: $${snapshot.cash_usd.toFixed(2)}\n` +
    `Total portfolio value: $${snapshot.total_value_usd.toFixed(2)}\n\n` +
    buildPerformanceSection(returnMetrics, momentum) +
    wording.newHoldingsLine +
    'IMPORTANT ticker rules — all tickers in target_allocation must follow these rules:\n' +
    wording.tickerRules +
    '  3. Limit new additions to a maximum of 3 new instruments per recommendation.\n' +
    '  4. All recommended tickers will be validated against market data — invalid tickers will be stripped.\n\n' +
    CASH_RULES +
    'Output format — return a JSON object with exactly these four keys:\n' +
    OUTPUT_FORMAT_ALLOCATION +
    (hasGap
      ? '  summary_text: string (100–200 word overall assessment; must mention the performance gap and how the allocation addresses it)\n'
      : '  summary_text: string (100–200 word overall assessment; say there is not enough history for a performance verdict yet and how the mix is positioned for the target)\n') +
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

export async function runSynthesizer(params: SynthesizerParams): Promise<SynthesizerRunResult> {
  const { agentOutputs, snapshot, settings, recentSummaries, returnMetrics, holdingMomentum, isNewPortfolio, candidateTickers } = params

  const cfg = params.screening ?? FULL_SCREENING_CONFIG
  const systemPrompt = withIslamicMandate(isNewPortfolio
    ? buildNewPortfolioPrompt(settings, snapshot, candidateTickers ?? [], cfg)
    : buildSystemPrompt(settings, snapshot, returnMetrics, holdingMomentum, cfg), cfg)

  const { text: raw, stopReason, usage } = await callClaude({
    role:   'synthesizer',
    name:   'synthesizer',
    system: systemPrompt,
    user:   buildUserPrompt(agentOutputs, recentSummaries),
    apiKey: params.apiKey,
  })

  // A refusal or a truncated answer must never become a recommendation — throw so the step retries / fails.
  assertCompleteResponse(stopReason, 'Synthesizer')

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
  return { result: finaliseSynthesis(validationResult.data), usage }
}
