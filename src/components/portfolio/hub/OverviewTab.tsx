import { Suspense } from 'react'
import Link from 'next/link'
import TradingStatusBanner from '../TradingStatusBanner'
import AutopilotStatus from '../AutopilotStatus'
import AllocationBars from './AllocationBars'
import HoldingsList, { type HoldingView } from './HoldingsList'
import PerformanceSection from './PerformanceSection'
import RefreshButton from './RefreshButton'
import { ChartSkeleton } from './HubSkeletons'
import GettingStartedChecklist from './GettingStartedChecklist'
import { getAiKeyStatus } from '@/lib/aiKeyStore'
import { buildSetupChecklist } from '@/lib/setupChecklist'
import {
  getLatestCompleteRecommendation,
  getLiveState,
  getPendingApproval,
  getRecentExecutions,
  getSettingsRow,
} from '@/lib/portfolioHubData'
import { readSafetySettings } from '@/lib/riskLimits'
import { readAutopilotSettings } from '@/lib/schedule'
import { readShariahScreening } from '@/lib/shariahRules'
import {
  computeAllocationDrift,
  computeDayChange,
  formatSignedPct,
  formatSignedUsd,
  hubHref,
  shariahBadgeFor,
  tradesForTicker,
  type ChartPeriod,
} from '@/lib/portfolioHub'
import { formatUsd } from '@/lib/portfolioCalculator'
import type { LiveHolding, TargetAllocationItem } from '@/types/database'
import type { RatioKey, ScreeningRatio, ShariahScreeningResult } from '@/types/shariah'

interface Props {
  userId: string
  email: string
  period: ChartPeriod
}

const RATIO_KEYS: RatioKey[] = ['debt', 'cash_and_securities', 'receivables']
const RATIO_SHORT: Record<RatioKey, string> = { debt: 'Debt', cash_and_securities: 'Cash + securities', receivables: 'Receivables' }
const SOURCE_LABEL: Record<ScreeningRatio['source'], string> = { polygon: 'Polygon', ai_estimate: 'AI estimate', unavailable: 'unavailable' }

function ratioText(r: ScreeningRatio): string {
  if (r.value_pct === null) return '—'
  return `${r.basis === 'upper_bound' ? '≤ ' : ''}${r.value_pct.toFixed(1)}%`
}

// Fixed locale + time zone so server and client render the same string (no hydration mismatch)
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

function toHoldingView(
  h: LiveHolding,
  total: number,
  screening: ShariahScreeningResult | null,
  recommendationId: string | null,
  executions: Awaited<ReturnType<typeof getRecentExecutions>>,
): HoldingView {
  const badge = shariahBadgeFor(h.ticker, screening)
  return {
    ticker:           h.ticker,
    company_name:     h.company_name,
    qty:              h.qty,
    value_usd:        h.total_value_usd,
    pct_of_portfolio: total > 0 ? (h.total_value_usd / total) * 100 : 0,
    avg_entry_price:  h.avg_entry_price ?? null,
    current_price:    h.current_price ?? null,
    cost_basis:       h.cost_basis ?? null,
    unrealized_pl:    h.unrealized_pl ?? null,
    unrealized_plpc:  h.unrealized_plpc ?? null,
    shariah: badge.kind === 'unscreened'
      ? { kind: 'unscreened', reason: null, ratios: [], ratioSource: null, nonPermissibleIncomePct: null, screenedAt: null, recommendationId }
      : {
          kind:   badge.kind,
          reason: badge.reason,
          ratios: RATIO_KEYS.map(k => ({
            label:  RATIO_SHORT[k],
            value:  ratioText(badge.screening.ratios[k]),
            status: badge.screening.ratios[k].status,
            source: SOURCE_LABEL[badge.screening.ratios[k].source],
          })),
          ratioSource:             badge.screening.ratio_source,
          nonPermissibleIncomePct: badge.screening.non_permissible_income_pct,
          screenedAt:              badge.screening.screened_at,
          recommendationId,
        },
    trades: tradesForTicker(executions, h.ticker),
  }
}

/** Overview tab: headline numbers, performance, allocation vs target, holdings (+ drawer), autopilot. */
export default async function OverviewTab({ userId, email, period }: Props) {
  const [live, settingsRow, latestRec, pending, executions, aiKey] = await Promise.all([
    getLiveState(userId),
    getSettingsRow(userId),
    getLatestCompleteRecommendation(userId),
    getPendingApproval(userId),
    getRecentExecutions(userId, 50),
    getAiKeyStatus(userId, email),
  ])
  const safety = readSafetySettings(settingsRow)
  const autopilot = readAutopilotSettings(settingsRow)

  // The Overview only renders after the terms gate, so step ① is always done here.
  const checklist = buildSetupChecklist({
    tosAccepted:     true,
    alpacaConnected: live.connected,
    aiKey:           aiKey.connected ? 'own' : aiKey.usingOwnerFallback ? 'app_owner' : 'none',
    hasCompletedRun: !!latestRec,
  })
  const gettingStarted = checklist.complete
    ? null
    : <GettingStartedChecklist items={checklist.items} doneCount={checklist.doneCount} />

  const statusCards = (
    <>
      {gettingStarted}
      <TradingStatusBanner safety={safety} />
      <AutopilotStatus mode={autopilot.mode} nextRunAt={autopilot.next_run_at} pending={pending} />
    </>
  )

  if (!live.connected) {
    return (
      <div className="space-y-4">
        {statusCards}
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[var(--rule)] px-6 py-12 text-center">
          <p className="font-semibold text-[var(--ink-2)]">Connect your Alpaca account</p>
          <p className="max-w-md text-sm text-[var(--ink-3)]">
            Your holdings and cash are read live from Alpaca. Connect an account in Settings to see your portfolio and
            run an analysis.
          </p>
          <Link href={hubHref({ tab: 'settings' })} className="rounded-lg border border-[var(--rule)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink-2)]">
            Go to Settings →
          </Link>
        </div>
      </div>
    )
  }

  if (live.liveError || !live.portfolio) {
    return (
      <div className="space-y-4">
        {statusCards}
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Could not reach Alpaca to load your portfolio.</span>
          <RefreshButton label="Retry" busyLabel="Retrying…" className="text-amber-800" />
        </div>
      </div>
    )
  }

  const p = live.portfolio
  const accountValue = p.equity_usd ?? p.total_value_usd
  const dayChange = computeDayChange(p.equity_usd, p.last_equity_usd)
  const screening = latestRec ? readShariahScreening(latestRec as Parameters<typeof readShariahScreening>[0]) : null
  const target = (latestRec?.target_allocation as TargetAllocationItem[] | null | undefined) ?? null
  const allocation = computeAllocationDrift(p.holdings, p.cash_usd, target)
  const holdings = p.holdings.map(h => toHoldingView(h, p.total_value_usd, screening, (latestRec?.id as string) ?? null, executions))
  const flagged = holdings.filter(h => h.shariah.kind === 'flagged')
  const totalPl = p.holdings.reduce((s, h) => s + (h.unrealized_pl ?? 0), 0)
  const hasPl = p.holdings.some(h => h.unrealized_pl !== undefined)

  return (
    <div className="space-y-4">
      {gettingStarted}
      {safety.trading_paused && <TradingStatusBanner safety={{ ...safety, dry_run: false }} />}

      {/* Headline */}
      <section className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5" aria-label="Account summary">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-bold ${p.is_paper ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {p.is_paper ? 'PAPER' : 'LIVE'}
          </span>
          {safety.dry_run && (
            <span className="rounded bg-purple-600 px-2 py-0.5 font-mono font-bold text-white" title="Executions are simulated — nothing is sent to Alpaca">
              DRY RUN
            </span>
          )}
          <span className="text-[var(--ink-3)]" suppressHydrationWarning>as of {formatTime(p.fetched_at)}</span>
          <span className="text-[var(--rule)]">·</span>
          <RefreshButton className="text-[var(--ink-3)]" />
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Account value</p>
        <p className="font-mono text-3xl font-bold text-[var(--ink)] md:text-4xl">{formatUsd(accountValue)}</p>
        {dayChange ? (
          <p className={`mt-1 font-mono text-sm font-semibold ${dayChange.change_usd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {formatSignedUsd(dayChange.change_usd)}
            {dayChange.change_pct !== null && ` (${formatSignedPct(dayChange.change_pct)})`}
            <span className="ml-1 font-sans font-normal text-[var(--ink-3)]">today</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--ink-3)]">Today’s change unavailable</p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--rule-soft)] pt-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--ink-3)]">Cash</dt>
            <dd className="font-mono font-semibold text-[var(--ink)]">{formatUsd(p.cash_usd)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-3)]">Invested</dt>
            <dd className="font-mono font-semibold text-[var(--ink)]">{formatUsd(p.total_value_usd - p.cash_usd)}</dd>
          </div>
          {hasPl && (
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Unrealised P&amp;L</dt>
              <dd className={`font-mono font-semibold ${totalPl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatSignedUsd(totalPl)}</dd>
            </div>
          )}
        </dl>
      </section>

      <AutopilotStatus mode={autopilot.mode} nextRunAt={autopilot.next_run_at} pending={pending} />

      <Suspense key={period} fallback={<ChartSkeleton />}>
        <PerformanceSection userId={userId} period={period} />
      </Suspense>

      <AllocationBars
        rows={allocation}
        title="Allocation — current vs target"
        note={latestRec
          ? `Target from the analysis of ${new Date(latestRec.run_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })}.`
          : 'No analysis yet — run one in Rebalance to get a target allocation.'}
      />

      <section className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5" aria-labelledby="holdings-heading">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 id="holdings-heading" className="text-sm font-semibold text-[var(--ink)]">Holdings</h3>
          <span className="text-xs text-[var(--ink-3)]">{p.holdings.length} stock{p.holdings.length === 1 ? '' : 's'} · tap for details</span>
        </div>
        {flagged.length > 0 && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ⚠ {flagged.map(h => h.ticker).join(', ')} failed the latest Shariah screening — the recommendation sells{' '}
            {flagged.length === 1 ? 'it' : 'them'}. <Link href={hubHref({ tab: 'rebalance' })} className="font-semibold underline">Review</Link>
          </p>
        )}
        {holdings.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ink-3)]">
            {p.cash_usd > 0
              ? 'No positions yet. Run an analysis to get a starting portfolio built from your cash.'
              : 'No positions or cash in this Alpaca account yet. Fund the account to get started.'}
          </p>
        ) : (
          <HoldingsList holdings={holdings} />
        )}
      </section>

      {latestRec && (
        <section className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Latest analysis</h3>
          {typeof latestRec.summary_text === 'string' && (
            <p className="mt-1 line-clamp-3 text-sm text-[var(--ink-2)]">{latestRec.summary_text}</p>
          )}
          <Link href={hubHref({ tab: 'rebalance' })} className="mt-2 inline-block text-sm font-semibold text-[var(--blue-700)]">
            Review in Rebalance →
          </Link>
        </section>
      )}
    </div>
  )
}
