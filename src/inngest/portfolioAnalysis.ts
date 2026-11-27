import { z } from 'zod'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMacroeconomicsAgent } from '@/inngest/agents/macroeconomics'
import { runFedRatesAgent } from '@/inngest/agents/fedRates'
import { runGeopoliticsAgent } from '@/inngest/agents/geopolitics'
import { runSentimentAgent } from '@/inngest/agents/sentiment'
import { runFundamentalsAgent } from '@/inngest/agents/fundamentals'
import { fetchPriceHistory, fetchTickerDetails, checkTickersExist, fetchLatestFinancials, type PriceHistory, type TickerDetailsMap, type FinancialsMap } from '@/inngest/dataSources/polygon'
import { runTechnicalAnalysisAgent } from '@/inngest/agents/technicalAnalysis'
import { runSectorAnalysisAgent } from '@/inngest/agents/sectorAnalysis'
import { runSynthesizer, type SynthesizerRunResult } from '@/inngest/synthesizer'
import { runShariahReviewer, type ReviewerTickerInput, type ReviewerRunResult } from '@/inngest/shariahReviewer'
import type { AgentRunResult } from '@/inngest/agents/types'
import { summarizeRunUsage } from '@/lib/aiCost'
import { extractCashEntries, rescaleStocksToCash, CashAllocationSchema, type StoredCashAllocation } from '@/lib/cashAllocation'
import { buildRealReturnMetrics, computeHoldingMomentum, type RealReturnMetrics } from '@/lib/returnMetrics'
import {
  computePolygonRatios,
  decideTickerVerdict,
  applyShariahScreening,
  buildShariahScreeningResult,
  annotateActionList,
  NOT_COMPLIANT_SKIP_REASON,
  SCREENING_EXCLUDED_NOTE_PREFIX,
} from '@/lib/shariahRules'
import { computeActionList } from '@/lib/portfolioCalculator'
import { FULL_SCREENING_CONFIG, effectiveScreeningConfig, readScreeningSettings, type EffectiveScreeningConfig } from '@/lib/screeningConfig'
import { loadAlpacaCredentials, fetchLivePortfolio } from '@/lib/alpacaLivePortfolio'
import { fetchPortfolioHistoryWithFlows, isTradeableAsset } from '@/lib/alpacaClient'
import { getStarterUniverse } from '@/lib/starterUniverse'
import { readAutopilotSettings } from '@/lib/schedule'
import { buildScheduledRunInfo } from '@/lib/autopilot'
import { saveAutopilotInfo } from '@/lib/autopilotStore'
import { requireRunApiKey } from '@/lib/aiKeyStore'
import { redactSecrets } from '@/lib/aiKeyResolver'
import type { AgentOutput, PortfolioSettings, PortfolioSnapshot, TargetAllocationItem } from '@/types/database'

const EventDataSchema = z.object({
  run_id:  z.string().uuid(),
  user_id: z.string().uuid(),
  /** 'schedule' for runs started by src/inngest/scheduledRuns.ts; absent (older events) → manual. */
  trigger: z.enum(['manual', 'schedule']).optional().default('manual'),
})

/** Error text safe to store: app keys and (when known) the run owner's own Anthropic key are redacted. */
function sanitizeErrorMessage(err: unknown, extraSecrets: Array<string | null | undefined> = []): string {
  const raw = (err instanceof Error ? err.message : String(err)).slice(0, 500)
  return redactSecrets(raw, [
    process.env.FRED_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.NEWS_API_KEY,
    process.env.POLYGON_API_KEY,
    ...extraSecrets,
  ])
}

async function loadSettingsRow(userId: string): Promise<Record<string, unknown> | null> {
  const { data } = await createAdminClient()
    .from('portfolio_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data as Record<string, unknown> | null
}

/** Tickers Alpaca reports as active + tradeable. A lookup error keeps the ticker (Shariah screening still checks it). */
async function confirmTradeable(
  tickers: string[],
  creds: { keyId: string; secret: string; isPaper: boolean },
): Promise<Set<string>> {
  const checks = await Promise.all(tickers.map(async t => {
    try {
      return (await isTradeableAsset(t, creds.keyId, creds.secret, creds.isPaper)) ? t : null
    } catch {
      return t
    }
  }))
  return new Set(checks.filter((t): t is string => t !== null))
}

/**
 * A failed run must not count towards the run cooldown: reset last_run_at to the latest COMPLETE run
 * (or null). A failed scheduled run is made due again (next_run_at = null → picked up by the next trading-day check).
 */
async function releaseFailedRunCooldown(userId: string, trigger: 'manual' | 'schedule'): Promise<void> {
  const admin = createAdminClient()
  const { data: lastGood } = await admin
    .from('recommendations')
    .select('run_at')
    .eq('user_id', userId)
    .eq('status', 'complete')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const update: Record<string, unknown> = { last_run_at: (lastGood?.run_at as string | undefined) ?? null }
  if (trigger === 'schedule') update.next_run_at = null
  await admin.from('portfolio_settings').update(update).eq('user_id', userId)
}

interface FetchPortfolioResult {
  settings: PortfolioSettings
  tickers: string[]
  isNewPortfolio: boolean
  snapshot: PortfolioSnapshot
  /** Effective screening config read from the settings row at the start of the run (specs/030). */
  screening: EffectiveScreeningConfig
}

export const portfolioAnalysis = inngest.createFunction(
  {
    id:          'portfolio-analysis',
    triggers:    [{ event: 'portfolio/analysis.requested' }],
    // One analysis per run row, and never two analyses for the same user at once (manual + scheduled).
    idempotency: 'event.data.run_id',
    concurrency: { key: 'event.data.user_id', limit: 1 },
    // After retries are exhausted: make sure the run reads as failed, and release the cooldown so a
    // failed run never blocks the next one (manual runs can retry at once; a failed scheduled run is due again).
    onFailure: async ({ event, error }) => {
      const parsed = EventDataSchema.safeParse((event.data as { event?: { data?: unknown } } | undefined)?.event?.data)
      if (!parsed.success) return
      const { run_id, user_id, trigger } = parsed.data
      const admin = createAdminClient()
      try {
        await admin
          .from('recommendations')
          .update({ status: 'error', error_message: sanitizeErrorMessage(error), updated_at: new Date().toISOString() })
          .eq('id', run_id)
          .neq('status', 'complete')
        await admin
          .from('run_progress')
          .update({ status: 'error' })
          .eq('run_id', run_id)
          .in('status', ['pending', 'running'])
        await releaseFailedRunCooldown(user_id, trigger)
      } catch {
        // Best-effort clean-up only.
      }
    },
  },
  async ({ event, step }) => {
    const parseResult = EventDataSchema.safeParse(event.data)
    if (!parseResult.success) {
      throw new Error('Invalid event payload: expected run_id and user_id as UUIDs')
    }
    const { run_id, user_id, trigger } = parseResult.data

    // Step 1: Fetch portfolio data
    const { settings, tickers, isNewPortfolio, snapshot, screening: storedScreeningConfig } = await step.run(
      'fetch-portfolio',
      async (): Promise<FetchPortfolioResult> => {
        // No cookie session in Inngest — admin client used intentionally.
        // RLS is enforced in application code via the user_id equality check below.
        const admin = createAdminClient()

        // Verify run ownership before reading portfolio data (defence in depth)
        const { data: runCheck } = await admin
          .from('recommendations')
          .select('user_id')
          .eq('id', run_id)
          .single()

        if (!runCheck || runCheck.user_id !== user_id) {
          throw new Error(`Run ${run_id} does not belong to user — aborting`)
        }

        const { data: settingsRow } = await admin
          .from('portfolio_settings')
          .select('*')
          .eq('user_id', user_id)
          .single()

        const raw = settingsRow as PortfolioSettings & { target_horizon?: string }
        const portfolioSettings: PortfolioSettings = {
          ...raw,
          target_horizon: (raw.target_horizon === 'monthly' ? 'monthly' : 'annual'),
        }

        // The account is read live from Alpaca — holdings and cash are never stored in the app.
        // Decrypted keys stay inside this step; only the snapshot is returned (and persisted by Inngest).
        let live
        try {
          const creds = await loadAlpacaCredentials(user_id)
          if (!creds) throw new Error('No Alpaca account connected')
          live = await fetchLivePortfolio(creds)
        } catch (err) {
          await admin
            .from('recommendations')
            .update({ status: 'error', error_message: sanitizeErrorMessage(err), updated_at: new Date().toISOString() })
            .eq('id', run_id)
          throw err
        }

        const portfolioSnapshot: PortfolioSnapshot = {
          holdings: live.holdings.map(h => ({
            ticker:          h.ticker,
            company_name:    h.company_name,
            total_value_usd: h.total_value_usd,
          })),
          cash_usd:        live.cash_usd,
          total_value_usd: live.total_value_usd,
        }

        // Starting from scratch: give the per-ticker agents a starter candidate list to research
        const isNewPortfolio = portfolioSnapshot.holdings.length === 0
        const analysisTickers = isNewPortfolio
          ? getStarterUniverse(portfolioSettings.risk_profile)
          : portfolioSnapshot.holdings.map(h => h.ticker)

        return {
          settings:       portfolioSettings,
          tickers:        analysisTickers,
          isNewPortfolio,
          snapshot:       portfolioSnapshot,
          // Missing column / null → everything on (spec-019 behaviour)
          screening:      effectiveScreeningConfig(readScreeningSettings(settingsRow as Record<string, unknown> | null)),
        }
      },
    )
    // A run memoised before specs/030 has no config → full screening.
    const screeningConfig: EffectiveScreeningConfig = storedScreeningConfig ?? FULL_SCREENING_CONFIG

    // Step 2: Pre-fetch Polygon.io OHLCV data (once per run — rate-limit safe)
    const priceData = await step.run(
      'fetch-price-data',
      async (): Promise<PriceHistory> => fetchPriceHistory(tickers),
    )

    // Step 3a: Pre-fetch Polygon.io ticker reference data (for sector groupings)
    const tickerDetails = await step.run(
      'fetch-ticker-details',
      async (): Promise<TickerDetailsMap> => fetchTickerDetails(tickers),
    )

    // Step 3: Mark all agents as running
    await step.run('mark-agents-running', async (): Promise<void> => {
      const admin = createAdminClient()
      await admin
        .from('run_progress')
        .update({ status: 'running' })
        .eq('run_id', run_id)
        .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis', 'sector_analysis'])
    })

    // Step 4: Run all agents in parallel
    const agentResults = await Promise.all([
      step.run('run-macroeconomics', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runMacroeconomicsAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'macroeconomics'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),

      step.run('run-fed-rates', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runFedRatesAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'fed_rates'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),

      step.run('run-geopolitics', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runGeopoliticsAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'geopolitics'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),

      step.run('run-sentiment', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runSentimentAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'sentiment'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),

      step.run('run-fundamentals', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runFundamentalsAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'fundamentals'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),

      step.run('run-technical-analysis', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runTechnicalAnalysisAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
            priceData,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'technical_analysis'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),

      step.run('run-sector-analysis', async (): Promise<AgentRunResult> => {
        let apiKey: string | undefined
        try {
          // The run owner's own Anthropic key, resolved inside this step and never returned from it
          apiKey = await requireRunApiKey(user_id)
          return await runSectorAnalysisAgent({
            apiKey,
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            target_horizon:    settings.target_horizon,
            holdings_tickers:  tickers,
            is_new_portfolio:  isNewPortfolio,
            screening:         screeningConfig,
            priceData,
            tickerDetails,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err, [apiKey])
          const admin = createAdminClient()

          await Promise.all([
            admin
              .from('run_progress')
              .update({ status: 'error', error_message: errorMessage })
              .eq('run_id', run_id)
              .eq('agent_name', 'sector_analysis'),
            admin
              .from('recommendations')
              .update({ status: 'error', error_message: errorMessage, updated_at: new Date().toISOString() })
              .eq('id', run_id),
          ])

          throw err
        }
      }),
    ])
    const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput, fundamentalsOutput, technicalOutput, sectorOutput] =
      agentResults.map(r => r.output)
    // Each step returned its usage with its output, so usage survives retries (memoised step results).
    const agentUsage = agentResults.map(r => r.usage)

    // Step 5: Store outputs
    await step.run('store-outputs', async (): Promise<void> => {
      const admin = createAdminClient()
      const now = new Date().toISOString()

      await Promise.all([
        admin
          .from('run_progress')
          .update({ status: 'complete', completed_at: now })
          .eq('run_id', run_id)
          .in('agent_name', ['macroeconomics', 'fed_rates', 'geopolitics', 'sentiment', 'fundamentals', 'technical_analysis', 'sector_analysis']),
        admin
          .from('recommendations')
          .update({
            agent_outputs: {
              macroeconomics:     macroOutput,
              fed_rates:          fedRatesOutput,
              geopolitics:        geopoliticsOutput,
              sentiment:          sentimentOutput,
              fundamentals:       fundamentalsOutput,
              technical_analysis: technicalOutput,
              sector_analysis:    sectorOutput,
            },
            portfolio_snapshot: snapshot,
            updated_at:         now,
          })
          .eq('id', run_id),
      ])
    })

    // Step 6: Fetch recent recommendation summaries for context
    const recentSummaries = await step.run('fetch-summaries', async (): Promise<string[]> => {
      const admin = createAdminClient()
      const { data: recIds } = await admin
        .from('recommendations')
        .select('id')
        .eq('user_id', user_id)
        .order('run_at', { ascending: false })
        .limit(5)
      if (!recIds || recIds.length === 0) return []
      const ids = recIds.map(r => r.id)
      const { data: summaries } = await admin
        .from('recommendation_summaries')
        .select('summary_text')
        .in('recommendation_id', ids)
        .order('created_at', { ascending: false })
      return (summaries ?? []).map(s => s.summary_text)
    })

    const agentOutputs: Record<string, AgentOutput> = {
      macroeconomics:     macroOutput,
      fed_rates:          fedRatesOutput,
      geopolitics:        geopoliticsOutput,
      sentiment:          sentimentOutput,
      fundamentals:       fundamentalsOutput,
      technical_analysis: technicalOutput,
      sector_analysis:    sectorOutput,
    }

    // Progress rows for the post-agent stages (best-effort: progress display must never fail the run).
    const setStage = async (stage: 'synthesizer' | 'shariah_screening', status: 'running' | 'complete'): Promise<void> => {
      try {
        await createAdminClient()
          .from('run_progress')
          .update({ status, completed_at: status === 'complete' ? new Date().toISOString() : null })
          .eq('run_id', run_id)
          .eq('agent_name', stage)
      } catch {
        // Ignored — runs started before this change have no rows for these stages.
      }
    }

    const markRunError = async (err: unknown): Promise<void> => {
      const admin = createAdminClient()
      await admin
        .from('recommendations')
        .update({ status: 'error', error_message: sanitizeErrorMessage(err), updated_at: new Date().toISOString() })
        .eq('id', run_id)
      try {
        await admin
          .from('run_progress')
          .update({ status: 'error', error_message: sanitizeErrorMessage(err) })
          .eq('run_id', run_id)
          .eq('status', 'running')
        await releaseFailedRunCooldown(user_id, trigger)
      } catch {
        // Ignored — progress display / cooldown release are best-effort.
      }
    }

    // Step 6b: Real account return vs target (specs/031) from Alpaca's portfolio history. Credentials stay in this step;
    // only the computed metrics are returned. Never fails the run — errors become status "unavailable".
    const returnMetrics = await step.run('fetch-return-history', async (): Promise<RealReturnMetrics> => {
      const now = new Date()
      const base = { now, targetPct: settings.target_return_pct, horizon: settings.target_horizon }
      if (isNewPortfolio) return buildRealReturnMetrics({ ...base, history: null, programmeStart: null })
      let programmeStart: Date | null = null
      try {
        // Programme start = the user's first complete recommendation
        const { data: first } = await createAdminClient()
          .from('recommendations')
          .select('run_at')
          .eq('user_id', user_id)
          .eq('status', 'complete')
          .order('run_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        programmeStart = typeof first?.run_at === 'string' ? new Date(first.run_at) : null
        if (!programmeStart) return buildRealReturnMetrics({ ...base, history: null, programmeStart: null })
        const creds = await loadAlpacaCredentials(user_id)
        if (!creds) return buildRealReturnMetrics({ ...base, history: null, programmeStart, unavailableReason: 'No Alpaca account connected' })
        const history = await fetchPortfolioHistoryWithFlows('3M', '1D', creds.keyId, creds.secret, creds.isPaper)
        return buildRealReturnMetrics({ ...base, history, programmeStart })
      } catch {
        return buildRealReturnMetrics({ ...base, history: null, programmeStart: programmeStart ?? now, unavailableReason: 'Account history could not be fetched' })
      }
    })

    // Step 7: Synthesize agent outputs into a proposed allocation.
    // Each later stage is its own step so a retry never re-runs the synthesizer.
    const { result: synthResult, usage: synthUsage } = await step.run('synthesize', async (): Promise<SynthesizerRunResult> => {
      try {
        const apiKey = await requireRunApiKey(user_id)
        // Per-holding price change: an input for which positions are weak / strong — NOT the target verdict
        const holdingMomentum = computeHoldingMomentum(snapshot.holdings, priceData)
        await setStage('synthesizer', 'running')
        const result = await runSynthesizer({ agentOutputs, snapshot, settings, recentSummaries, returnMetrics, holdingMomentum, isNewPortfolio, candidateTickers: isNewPortfolio ? tickers : [], apiKey, screening: screeningConfig })
        await setStage('synthesizer', 'complete')
        return result
      } catch (err) {
        await markRunError(err)
        throw err
      }
    })

    // Step 8: Validate any tickers the synthesizer added that are not in the current holdings
    // (for a new portfolio that is every ticker, including starter candidates).
    // Polygon confirms the symbol exists; invalid ones are stripped and the remaining STOCKS rescaled to 100 − cash.
    // Reserved cash words (CASH, USD, money-market symbols …) are converted into cash and never validated as tickers.
    const { allocation: validatedAllocation, cash_target_pct: synthCashPct } = await step.run('validate-tickers', async (): Promise<{ allocation: TargetAllocationItem[]; cash_target_pct: number }> => {
      try {
        // Idempotent re-extraction also covers a synthesizer result memoised before specs/031 (no cash field)
        const { stocks, cash_target_pct } = extractCashEntries(synthResult.target_allocation, synthResult.cash_target_pct ?? 0)
        const existingTickerSet = new Set(snapshot.holdings.map(h => h.ticker))
        const newTickers = stocks
          .map(a => a.ticker)
          .filter(t => !existingTickerSet.has(t))

        let cleaned = stocks
        if (newTickers.length > 0) {
          // Alpaca (generous rate limits) confirms the symbol is an active, tradeable asset; Polygon only as a fallback.
          const creds = await loadAlpacaCredentials(user_id)
          const confirmedNew = creds ? await confirmTradeable(newTickers, creds) : await checkTickersExist(newTickers)
          const invalid = new Set(newTickers.filter(t => !confirmedNew.has(t)))
          if (invalid.size > 0) cleaned = rescaleStocksToCash(stocks.filter(a => !invalid.has(a.ticker)), cash_target_pct)
        }
        if (cleaned.length === 0) throw new Error('Recommendation contained no valid tickers')
        return { allocation: cleaned, cash_target_pct }
      } catch (err) {
        await markRunError(err)
        throw err
      }
    })

    // Every proposed ticker AND every current holding is screened.
    const holdingTickers = snapshot.holdings.map(h => h.ticker)
    const screeningTickers = Array.from(new Set([...validatedAllocation.map(a => a.ticker), ...holdingTickers]))

    // Step 9: Real market data for the Shariah screen (security type, SIC, market cap, financials)
    const screeningData = await step.run('fetch-shariah-data', async (): Promise<{ details: TickerDetailsMap; financials: FinancialsMap }> => {
      await setStage('shariah_screening', 'running')
      const missing = screeningTickers.filter(t => !tickerDetails[t])
      const extraDetails = await fetchTickerDetails(missing)
      // Financials only feed the Islamic screens — not fetched when Islamic screening is off (specs/030).
      const financials: FinancialsMap = screeningConfig.islamic ? await fetchLatestFinancials(screeningTickers) : {}
      const details: TickerDetailsMap = {}
      for (const t of screeningTickers) details[t] = tickerDetails[t] ?? extraDetails[t]
      return { details, financials }
    })

    const holdingSet = new Set(holdingTickers)
    const reviewerInputs: ReviewerTickerInput[] = screeningTickers.map(t => {
      const d   = screeningData.details[t]
      const fin = screeningData.financials[t] ?? null
      return {
        ticker:          t,
        name:            d?.name ?? null,
        is_holding:      holdingSet.has(t),
        security_type:   d?.type ?? null,
        sic_code:        d?.sic_code ?? null,
        sic_description: d?.sic_description ?? null,
        market_cap_usd:  d?.market_cap ?? null,
        revenues_usd:    fin?.revenues ?? null,
        period_end:      fin?.period_end ?? null,
        polygon_ratios:  computePolygonRatios(fin, d?.market_cap ?? null),
      }
    })

    // Step 10: Separate, strict AI review of every ticker (tailored to the enabled parts). Skipped with no AI call when
    // Islamic screening is off — the stocks-only check then uses the Polygon type only (unknown type fails).
    const { verdicts: reviewerVerdicts, usage: reviewerUsage } = await step.run('shariah-review', async (): Promise<ReviewerRunResult> => {
      if (!screeningConfig.islamic) return { verdicts: {}, usage: null }
      try {
        return await runShariahReviewer(reviewerInputs, await requireRunApiKey(user_id), screeningConfig)
      } catch (err) {
        await markRunError(err)
        throw err
      }
    })

    // Step 11: Code-level verdicts, drop non-compliant tickers, compute actions and save
    await step.run('screen-and-save', async (): Promise<void> => {
      const admin = createAdminClient()
      const now = new Date().toISOString()
      // Token usage + cost of every Claude call in this run (stored in agent_outputs.usage — no migration needed)
      const usage = summarizeRunUsage([...agentUsage, synthUsage, reviewerUsage])

      const screenings = reviewerInputs.map(input => decideTickerVerdict({
        ticker:          input.ticker,
        name:            input.name,
        security_type:   input.security_type,
        sic_code:        input.sic_code,
        sic_description: input.sic_description,
        polygonRatios:   input.polygon_ratios,
        reviewer:        reviewerVerdicts[input.ticker] ?? null,
        is_holding:      input.is_holding,
        screened_at:     now,
      }, screeningConfig))

      let screened
      try {
        screened = applyShariahScreening(validatedAllocation, screenings, undefined, screeningConfig.islamic, synthCashPct ?? 0)
      } catch (err) {
        // Keep the screening visible on the failed run, then fail it.
        const failed = buildShariahScreeningResult(
          screenings,
          screenings.filter(s => s.verdict !== 'compliant').map(s => ({ ticker: s.ticker, reasons: s.reasons })),
          now,
          screeningConfig,
        )
        await admin
          .from('recommendations')
          .update({ agent_outputs: { ...agentOutputs, shariah_review: failed, usage }, updated_at: now })
          .eq('id', run_id)
        await markRunError(err)
        throw err
      }

      const screening  = buildShariahScreeningResult(screenings, screened.excluded, now, screeningConfig)
      // Explicit cash (specs/031): synthesizer cash + whatever the per-stock cap could not place. Stored in
      // agent_outputs.cash_allocation (no migration); target_allocation keeps stocks only.
      const cashAllocation: StoredCashAllocation = CashAllocationSchema.parse({
        version:         1,
        cash_target_pct: Math.min(100, Math.max(0, screened.cash_target_pct)),
        converted:       synthResult.cash_converted ?? [],
      })
      const actionList = annotateActionList(
        computeActionList(snapshot.holdings, snapshot.cash_usd, screened.kept, cashAllocation.cash_target_pct),
        screened.excluded,
        screeningConfig.islamic ? NOT_COMPLIANT_SKIP_REASON : SCREENING_EXCLUDED_NOTE_PREFIX,
      )

      const { error } = await admin
        .from('recommendations')
        .update({
          target_allocation: screened.kept,
          action_list:       actionList,
          summary_text:      synthResult.summary_text,
          conflict_notes:    synthResult.conflict_notes,
          // Compact copy that survives even when the shariah_screening migration is not applied;
          // cash target + the real-return metrics the synthesizer saw (specs/031) live here too.
          agent_outputs:     { ...agentOutputs, shariah_review: screening, usage, cash_allocation: cashAllocation, return_metrics: returnMetrics },
          status:            'complete',
          updated_at:        now,
        })
        .eq('id', run_id)
      if (error) {
        await markRunError(new Error('Failed to save recommendation'))
        throw new Error('Failed to save recommendation')
      }

      await setStage('shariah_screening', 'complete')

      // Best-effort: the dedicated column only exists once the migration is applied.
      try {
        await admin.from('recommendations').update({ shariah_screening: screening }).eq('id', run_id)
      } catch {
        // Ignored — agent_outputs.shariah_review already holds the data.
      }
    })

    // Scheduled runs: record the trigger + autopilot mode (approval → pending for 24 h). Never fails the run.
    if (trigger === 'schedule') {
      await step.run('mark-autopilot', async (): Promise<void> => {
        try {
          const mode = readAutopilotSettings(await loadSettingsRow(user_id)).mode
          await saveAutopilotInfo(run_id, user_id, buildScheduledRunInfo(mode, new Date()))
        } catch {
          // Ignored — without the marker the run simply behaves like a manual one (no approval, no auto-execution).
        }
      })
    }

    await step.sendEvent('emit-completed', {
      name: 'portfolio/run.completed',
      data: { run_id, user_id, trigger },
    })
  },
)
