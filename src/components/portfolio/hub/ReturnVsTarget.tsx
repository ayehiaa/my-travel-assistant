import { describeTarget, MIN_HISTORY_DAYS, type RealReturnMetrics } from '@/lib/returnMetrics'
import { formatSignedPct } from '@/lib/portfolioHub'

interface Props {
  metrics: RealReturnMetrics
  /** Explicit cash target of the recommendation (specs/031); null for older recommendations. */
  cashTargetPct?: number | null
}

/**
 * The real account return vs target exactly as the synthesizer saw it for this recommendation (specs/031):
 * time-weighted, deposits / withdrawals excluded, from Alpaca's portfolio history.
 */
export default function ReturnVsTarget({ metrics: m, cashTargetPct = null }: Props) {
  const ok = m.status === 'ok' && m.period_return_pct !== null && m.gap_pct !== null
  return (
    <section className="min-w-0 rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5" aria-labelledby="return-target-heading">
      <h3 id="return-target-heading" className="mb-3 text-sm font-semibold text-[var(--ink)]">Performance vs target</h3>
      {ok ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-[var(--ink-3)]">Period</dt>
            <dd className="font-mono text-[var(--ink-2)]">
              {Math.round(m.days)} days
              <span className="block text-xs text-[var(--ink-3)]">{m.start_date} → {m.end_date}</span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--ink-3)]">{m.basis === 'annualised' ? 'Return (annualised)' : 'Return (period)'}</dt>
            <dd className={`font-mono font-semibold ${(m.basis === 'annualised' ? m.annualised_return_pct ?? 0 : m.period_return_pct ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatSignedPct(m.basis === 'annualised' ? m.annualised_return_pct ?? 0 : m.period_return_pct ?? 0)}
              {m.basis === 'annualised' && (
                <span className="block text-xs font-normal text-[var(--ink-3)]">{formatSignedPct(m.period_return_pct ?? 0)} over the period</span>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--ink-3)]">Target</dt>
            <dd className="break-words font-mono text-xs text-[var(--ink-2)]">{describeTarget(m)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-[var(--ink-3)]">Gap</dt>
            <dd className={`font-mono font-semibold ${(m.gap_pct ?? 0) >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {formatSignedPct(m.gap_pct ?? 0).replace('%', ' pp')}
              <span className="block text-xs font-normal text-[var(--ink-3)]">{(m.gap_pct ?? 0) >= 0 ? 'ahead of target' : 'behind target'}</span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-[var(--ink-2)]">
          {m.status === 'unavailable'
            ? `Account history was unavailable for this analysis (${m.reason ?? 'unknown reason'}).`
            : `Not enough history for a verdict yet — ${m.reason ?? `fewer than ${MIN_HISTORY_DAYS} days.`}`}{' '}
          The analysis focused on building the target mix. Target: {m.target_annual_pct.toFixed(2)}% a year.
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--ink-3)]">
        Real account return from Alpaca, time-weighted (deposits and withdrawals excluded)
        {m.method === 'equity' ? ' — this account sent no P/L data, so deposits may be included' : ''}. Same figures the
        AI used for this recommendation.
        {cashTargetPct !== null && ` Cash target: ${cashTargetPct.toFixed(1)}%.`}
      </p>
    </section>
  )
}
