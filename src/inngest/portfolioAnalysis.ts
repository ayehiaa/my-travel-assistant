import { z } from 'zod'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMacroeconomicsAgent } from '@/inngest/agents/macroeconomics'
import { runFedRatesAgent } from '@/inngest/agents/fedRates'
import { runGeopoliticsAgent } from '@/inngest/agents/geopolitics'
import { runSentimentAgent } from '@/inngest/agents/sentiment'
import { runFundamentalsAgent } from '@/inngest/agents/fundamentals'
import { fetchPriceHistory, fetchTickerDetails, checkTickersExist, type PriceHistory, type TickerDetailsMap } from '@/inngest/dataSources/polygon'
import { runTechnicalAnalysisAgent } from '@/inngest/agents/technicalAnalysis'
import { runSectorAnalysisAgent } from '@/inngest/agents/sectorAnalysis'
import { runSynthesizer } from '@/inngest/synthesizer'
import { computeActionList } from '@/lib/portfolioCalculator'
import type { AgentOutput, PortfolioSettings, PortfolioSnapshot } from '@/types/database'

const EventDataSchema = z.object({
  run_id:  z.string().uuid(),
  user_id: z.string().uuid(),
})

function sanitizeErrorMessage(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err)).slice(0, 500)
  const keys = [process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.NEWS_API_KEY, process.env.POLYGON_API_KEY].filter(Boolean) as string[]
  return keys.reduce((msg, key) => msg.split(key).join('[REDACTED]'), raw)
}

interface PortfolioHoldingRow {
  ticker: string
  company_name: string
  total_value_usd: number
}

interface FetchPortfolioResult {
  settings: PortfolioSettings
  tickers: string[]
  snapshot: PortfolioSnapshot
}

export const portfolioAnalysis = inngest.createFunction(
  { id: 'portfolio-analysis', triggers: [{ event: 'portfolio/analysis.requested' }] },
  async ({ event, step }) => {
    const parseResult = EventDataSchema.safeParse(event.data)
    if (!parseResult.success) {
      throw new Error('Invalid event payload: expected run_id and user_id as UUIDs')
    }
    const { run_id, user_id } = parseResult.data

    // Step 1: Fetch portfolio data
    const { settings, tickers, snapshot } = await step.run(
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

        const [settingsResult, holdingsResult] = await Promise.all([
          admin
            .from('portfolio_settings')
            .select('*')
            .eq('user_id', user_id)
            .single(),
          admin
            .from('portfolio_holdings')
            .select('ticker, company_name, total_value_usd')
            .eq('user_id', user_id),
        ])

        const portfolioSettings = settingsResult.data as PortfolioSettings
        const holdings = (holdingsResult.data ?? []) as PortfolioHoldingRow[]

        const holdingsTotal = holdings.reduce(
          (sum, h) => sum + h.total_value_usd,
          0,
        )
        const cash_usd = portfolioSettings?.cash_usd ?? 0

        const portfolioSnapshot: PortfolioSnapshot = {
          holdings: holdings.map(h => ({
            ticker:          h.ticker,
            company_name:    h.company_name,
            total_value_usd: h.total_value_usd,
          })),
          cash_usd,
          total_value_usd: holdingsTotal + cash_usd,
        }

        return {
          settings:  portfolioSettings,
          tickers:   holdings.map(h => h.ticker),
          snapshot:  portfolioSnapshot,
        }
      },
    )

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
    const [macroOutput, fedRatesOutput, geopoliticsOutput, sentimentOutput, fundamentalsOutput, technicalOutput, sectorOutput] = await Promise.all([
      step.run('run-macroeconomics', async (): Promise<AgentOutput> => {
        try {
          return await runMacroeconomicsAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

      step.run('run-fed-rates', async (): Promise<AgentOutput> => {
        try {
          return await runFedRatesAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

      step.run('run-geopolitics', async (): Promise<AgentOutput> => {
        try {
          return await runGeopoliticsAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

      step.run('run-sentiment', async (): Promise<AgentOutput> => {
        try {
          return await runSentimentAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

      step.run('run-fundamentals', async (): Promise<AgentOutput> => {
        try {
          return await runFundamentalsAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

      step.run('run-technical-analysis', async (): Promise<AgentOutput> => {
        try {
          return await runTechnicalAnalysisAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
            priceData,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

      step.run('run-sector-analysis', async (): Promise<AgentOutput> => {
        try {
          return await runSectorAnalysisAgent({
            risk_profile:      settings.risk_profile,
            target_return_pct: settings.target_return_pct,
            holdings_tickers:  tickers,
            priceData,
            tickerDetails,
          })
        } catch (err) {
          const errorMessage = sanitizeErrorMessage(err)
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

    // Step 7: Synthesize agent outputs into a final recommendation
    await step.run('synthesize', async (): Promise<void> => {
      const admin = createAdminClient()
      const now = new Date().toISOString()
      try {
        const agentOutputs = {
          macroeconomics:     macroOutput,
          fed_rates:          fedRatesOutput,
          geopolitics:        geopoliticsOutput,
          sentiment:          sentimentOutput,
          fundamentals:       fundamentalsOutput,
          technical_analysis: technicalOutput,
          sector_analysis:    sectorOutput,
        }
        const synthResult = await runSynthesizer({ agentOutputs, snapshot, settings, recentSummaries })

        // Validate any tickers the synthesizer added that are not in the current holdings.
        // Polygon confirms the symbol exists; invalid ones are stripped and the remaining
        // percentages are renormalised to 100 before the allocation is saved or executed.
        const existingTickerSet = new Set(tickers)
        const newTickers = synthResult.target_allocation
          .map(a => a.ticker)
          .filter(t => !existingTickerSet.has(t))

        let cleanedAllocation = synthResult.target_allocation
        if (newTickers.length > 0) {
          const confirmedNew = await checkTickersExist(newTickers)
          const invalidTickers = newTickers.filter(t => !confirmedNew.has(t))

          if (invalidTickers.length > 0) {
            const invalidSet = new Set(invalidTickers)
            const valid = synthResult.target_allocation.filter(a => !invalidSet.has(a.ticker))
            const total  = valid.reduce((s, a) => s + a.target_pct, 0)

            if (total > 0 && total < 99.5) {
              const scale   = 100 / total
              const scaled  = valid.map(a => ({ ...a, target_pct: a.target_pct * scale }))
              // Absorb floating-point rounding into the largest position
              const scaledTotal = scaled.reduce((s, a) => s + a.target_pct, 0)
              const diff    = 100 - scaledTotal
              const maxIdx  = scaled.reduce((mi, a, i) => a.target_pct > scaled[mi].target_pct ? i : mi, 0)
              scaled[maxIdx] = { ...scaled[maxIdx], target_pct: scaled[maxIdx].target_pct + diff }
              cleanedAllocation = scaled
            } else {
              cleanedAllocation = valid
            }
          }
        }

        const actionList = computeActionList(snapshot.holdings, snapshot.cash_usd, cleanedAllocation)
        await admin
          .from('recommendations')
          .update({
            target_allocation: cleanedAllocation,
            action_list:       actionList,
            summary_text:      synthResult.summary_text,
            conflict_notes:    synthResult.conflict_notes,
            status:            'complete',
            updated_at:        now,
          })
          .eq('id', run_id)
        await step.sendEvent('emit-completed', {
          name: 'portfolio/run.completed',
          data: { run_id, user_id },
        })
      } catch (err) {
        await admin
          .from('recommendations')
          .update({
            status:        'error',
            error_message: sanitizeErrorMessage(err),
            updated_at:    now,
          })
          .eq('id', run_id)
        throw err
      }
    })
  },
)
