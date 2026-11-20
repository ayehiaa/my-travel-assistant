import Link from 'next/link'
import LineChart from './LineChart'
import { fetchPortfolioHistory } from '@/lib/alpacaClient'
import { getCredentials, getSettingsRow } from '@/lib/portfolioHubData'
import {
  CHART_PERIODS,
  PERIOD_DAYS,
  PERIOD_TIMEFRAME,
  computePeriodReturnPct,
  formatSignedPct,
  hubHref,
  proratedTargetPct,
  type ChartPeriod,
} from '@/lib/portfolioHub'
import { formatUsd } from '@/lib/portfolioCalculator'
import type { TargetHorizon } from '@/types/database'

interface Props {
  userId: string
  period: ChartPeriod
}

/** Alpaca names the one-year period "1A". */
const ALPACA_PERIOD: Record<ChartPeriod, '1W' | '1M' | '3M' | '1A'> = { '1W': '1W', '1M': '1M', '3M': '3M', '1Y': '1A' }

function formatDay(unixSeconds: number | undefined): string | undefined {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return undefined
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
}

/** Account value over time + period return vs the user's prorated target. Async: streams in its own Suspense. */
export default async function PerformanceSection({ userId, period }: Props) {
  const [creds, settingsRow] = await Promise.all([getCredentials(userId), getSettingsRow(userId)])
  if (!creds) return null

  let history: Awaited<ReturnType<typeof fetchPortfolioHistory>> | null = null
  try {
    history = await fetchPortfolioHistory(ALPACA_PERIOD[period], PERIOD_TIMEFRAME[period], creds.keyId, creds.secret, creds.isPaper)
  } catch {
    history = null
  }

  const targetPct = typeof settingsRow?.target_return_pct === 'number' ? settingsRow.target_return_pct : Number(settingsRow?.target_return_pct ?? 10)
  const horizon: TargetHorizon = settingsRow?.target_horizon === 'monthly' ? 'monthly' : 'annual'
  const periodTarget = proratedTargetPct(Number.isFinite(targetPct) ? targetPct : 10, horizon, PERIOD_DAYS[period])
  const periodReturn = history ? computePeriodReturnPct(history.equity, history.profit_loss_pct) : null
  const firstEquity = history?.equity.find(v => v !== null && v > 0) ?? null
  const lastEquity = history ? [...history.equity].reverse().find(v => v !== null) ?? null : null
  const onTrack = periodReturn !== null && periodReturn >= periodTarget

  return (
    <section className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5" aria-labelledby="perf-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="perf-heading" className="text-sm font-semibold text-[var(--ink)]">Performance</h3>
          {periodReturn !== null ? (
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              <span className={`font-mono text-base font-bold ${periodReturn >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatSignedPct(periodReturn)}
              </span>{' '}
              this period · target {formatSignedPct(periodTarget)}{' '}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  onTrack ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {onTrack ? 'On track' : 'Behind target'}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--ink-3)]">Target for this period: {formatSignedPct(periodTarget)}</p>
          )}
          <p className="mt-0.5 text-xs text-[var(--ink-4)]">
            Target is your {targetPct}% {horizon} goal, compounded to {PERIOD_DAYS[period]} days.
          </p>
        </div>
        <div className="flex rounded-lg bg-[var(--paper-2)] p-0.5" role="group" aria-label="Chart period">
          {CHART_PERIODS.map(p => (
            <Link
              key={p}
              href={hubHref({ tab: 'overview', period: p })}
              scroll={false}
              aria-current={p === period ? 'true' : undefined}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${
                p === period ? 'bg-white text-[var(--ink)] shadow-sm' : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      </div>

      {history === null ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Could not load account history from Alpaca.</p>
      ) : (
        <LineChart
          values={history.equity}
          baseline={firstEquity}
          className={periodReturn !== null && periodReturn < 0 ? 'text-red-600' : 'text-emerald-600'}
          title={`Account value, last ${period}`}
          description={
            firstEquity !== null && lastEquity !== null
              ? `Account value moved from ${formatUsd(firstEquity)} to ${formatUsd(lastEquity)}${periodReturn !== null ? `, a return of ${formatSignedPct(periodReturn)}` : ''}. Target for the period: ${formatSignedPct(periodTarget)}.`
              : 'Not enough data.'
          }
          startLabel={formatDay(history.timestamp[0])}
          endLabel={formatDay(history.timestamp[history.timestamp.length - 1])}
        />
      )}
    </section>
  )
}
