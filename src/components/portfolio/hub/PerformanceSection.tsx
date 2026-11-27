import Link from 'next/link'
import LineChart from './LineChart'
import { fetchPortfolioHistoryWithFlows } from '@/lib/alpacaClient'
import { getCredentials, getSettingsRow } from '@/lib/portfolioHubData'
import {
  CHART_PERIODS,
  PERIOD_DAYS,
  PERIOD_TIMEFRAME,
  firstFundedIndex,
  formatSignedPct,
  hubHref,
  proratedTargetPct,
  summarisePeriodPerformance,
  type ChartPeriod,
} from '@/lib/portfolioHub'
import { formatUsd } from '@/lib/portfolioCalculator'
import { excludedCashFlows } from '@/lib/returnMetrics'
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

/** Scrub readout label: "Tue 25 Nov" for daily points, "Tue 25 Nov, 14:00" for hourly ones (UK time). */
function formatPoint(unixSeconds: number, timeframe: '1H' | '1D'): string {
  const d = new Date(unixSeconds * 1000)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
  if (timeframe === '1D') return day
  return `${day}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`
}

/** Account value over time + period return vs the user's prorated target. Async: streams in its own Suspense. */
export default async function PerformanceSection({ userId, period }: Props) {
  const [creds, settingsRow] = await Promise.all([getCredentials(userId), getSettingsRow(userId)])
  if (!creds) return null

  let history: Awaited<ReturnType<typeof fetchPortfolioHistoryWithFlows>> | null = null
  try {
    history = await fetchPortfolioHistoryWithFlows(ALPACA_PERIOD[period], PERIOD_TIMEFRAME[period], creds.keyId, creds.secret, creds.isPaper)
  } catch {
    history = null
  }

  const targetPct = typeof settingsRow?.target_return_pct === 'number' ? settingsRow.target_return_pct : Number(settingsRow?.target_return_pct ?? 10)
  const horizon: TargetHorizon = settingsRow?.target_horizon === 'monthly' ? 'monthly' : 'annual'
  const target = Number.isFinite(targetPct) ? targetPct : 10
  const perf = history ? summarisePeriodPerformance(history, target, horizon) : null
  const from = history ? firstFundedIndex(history.equity) : 0
  const chartValues = history ? history.equity.slice(from) : []
  const firstEquity = chartValues.find(v => v !== null && v > 0) ?? null
  const lastEquity = [...chartValues].reverse().find(v => v !== null) ?? null
  const netFlows = history?.cash_flows ? excludedCashFlows(history) : 0
  const measuredDays = perf?.days ?? PERIOD_DAYS[period]
  const sinceLabel = perf?.funded_in_period ? ` since funded ${formatDay(perf.start_ts)} (${perf.days} days)` : ''
  const pill = perf === null ? null
    : perf.verdict === 'on_track' ? { text: 'On track', cls: 'bg-emerald-100 text-emerald-800' }
    : perf.verdict === 'behind' ? { text: 'Behind target', cls: 'bg-amber-100 text-amber-800' }
    : { text: 'Too early to tell', cls: 'bg-[var(--paper-2)] text-[var(--ink-3)]' }

  return (
    <section className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5" aria-labelledby="perf-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="perf-heading" className="text-sm font-semibold text-[var(--ink)]">Performance</h3>
          {perf !== null && pill !== null ? (
            <p className="mt-1 text-sm text-[var(--ink-2)]">
              <span className={`font-mono text-base font-bold ${perf.return_pct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatSignedPct(perf.return_pct)}
              </span>{' '}
              {sinceLabel || 'this period'} · target {formatSignedPct(perf.target_pct)}{' '}
              <span className={`ml-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${pill.cls}`}>{pill.text}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--ink-3)]">Target for this period: {formatSignedPct(proratedTargetPct(target, horizon, PERIOD_DAYS[period]))}</p>
          )}
          {perf !== null && firstEquity !== null && lastEquity !== null && (
            <p className="mt-0.5 font-mono text-xs text-[var(--ink-3)]">
              {formatUsd(firstEquity)} → {formatUsd(lastEquity)}
              {netFlows ? ` · ${netFlows > 0 ? 'deposits' : 'withdrawals'} ${formatUsd(Math.abs(netFlows))} excluded` : ''}
            </p>
          )}
          <p className="mt-0.5 text-xs text-[var(--ink-4)]">
            Target is your {targetPct}% {horizon} goal, compounded to {measuredDays} days{perf?.verdict === 'too_early' ? '; a verdict needs 3+ weeks of history' : ''}.
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
          values={chartValues}
          unit="usd"
          pointLabels={history.timestamp.slice(from).map(t => formatPoint(t, PERIOD_TIMEFRAME[period]))}
          baseline={firstEquity}
          className={perf !== null && perf.return_pct < 0 ? 'text-red-600' : 'text-emerald-600'}
          title={`Account value, last ${period}`}
          description={
            firstEquity !== null && lastEquity !== null
              ? `Account value moved from ${formatUsd(firstEquity)} to ${formatUsd(lastEquity)}${perf !== null ? `, a return of ${formatSignedPct(perf.return_pct)}. Target: ${formatSignedPct(perf.target_pct)}.` : '.'}`
              : 'Not enough data.'
          }
          startLabel={formatDay(history.timestamp[from])}
          endLabel={formatDay(history.timestamp[history.timestamp.length - 1])}
        />
      )}
    </section>
  )
}
