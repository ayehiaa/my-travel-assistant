import { z } from 'zod'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMacroeconomicsAgent } from '@/inngest/agents/macroeconomics'
import { runFedRatesAgent } from '@/inngest/agents/fedRates'
import type { AgentOutput, PortfolioSettings, PortfolioSnapshot } from '@/types/database'

const EventDataSchema = z.object({
  run_id:  z.string().uuid(),
  user_id: z.string().uuid(),
})

function sanitizeErrorMessage(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err)).slice(0, 500)
  const keys = [process.env.FRED_API_KEY, process.env.ANTHROPIC_API_KEY].filter(Boolean) as string[]
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

    // Step 2: Mark both agents as running
    await step.run('mark-agents-running', async (): Promise<void> => {
      const admin = createAdminClient()
      await admin
        .from('run_progress')
        .update({ status: 'running' })
        .eq('run_id', run_id)
        .in('agent_name', ['macroeconomics', 'fed_rates'])
    })

    // Step 3: Run macroeconomics and fed rates agents in parallel
    const [macroOutput, fedRatesOutput] = await Promise.all([
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
    ])

    // Step 4: Store outputs
    await step.run('store-outputs', async (): Promise<void> => {
      const admin = createAdminClient()
      const now = new Date().toISOString()

      await Promise.all([
        admin
          .from('run_progress')
          .update({ status: 'complete', completed_at: now })
          .eq('run_id', run_id)
          .in('agent_name', ['macroeconomics', 'fed_rates']),
        admin
          .from('recommendations')
          .update({
            agent_outputs:      { macroeconomics: macroOutput, fed_rates: fedRatesOutput },
            portfolio_snapshot: snapshot,
            status:             'complete',
            updated_at:         now,
          })
          .eq('id', run_id),
      ])
    })
  },
)
