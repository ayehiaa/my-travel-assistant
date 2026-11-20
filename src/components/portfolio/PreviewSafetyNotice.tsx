import type { PreviewSafety } from '@/app/api/portfolio/alpaca/preview/route'
import { formatUsd } from './AlpacaOrderPreview'

interface Props {
  safety: PreviewSafety
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** True when the preview's safety state means nothing may be submitted. */
export function isPreviewBlocked(safety: PreviewSafety | null): boolean {
  return !!safety && (safety.trading_paused || safety.loss_stop.blocked)
}

/** Kill switch / loss stop / dry run state and what the risk limits changed — shown in the execute modal. */
export default function PreviewSafetyNotice({ safety }: Props) {
  const { risk_summary: summary, risk_adjustments: adjustments } = safety
  return (
    <div className="mb-4 space-y-3">
      {safety.trading_paused && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          Trading is paused{safety.paused_reason ? ` — ${safety.paused_reason}` : ''}. Resume it in Portfolio Settings
          before executing.
        </p>
      )}
      {!safety.trading_paused && safety.loss_stop.blocked && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {safety.loss_stop.reason ?? 'A loss stop is active'}.
          {safety.loss_stop.triggered ? ' Executing now would engage the trading pause.' : ''}
        </p>
      )}
      {safety.dry_run && (
        <p className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm text-purple-900">
          <span className="mr-2 rounded bg-purple-600 px-2 py-0.5 font-mono text-xs font-bold text-white">DRY RUN</span>
          Everything is planned and recorded, but no orders will be sent to Alpaca.
        </p>
      )}
      {!safety.migration_applied && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Safety settings are not stored yet (database migration pending) — default limits and dry run apply.
        </p>
      )}

      <div className="rounded-lg border border-[var(--rule)] bg-gray-50 px-3 py-2 text-xs text-[var(--ink-2)]">
        <p className="font-semibold text-[var(--ink)]">Risk limits</p>
        <p className="mt-1">
          Turnover {round1(summary.turnover_after_pct)}% of {formatUsd(summary.portfolio_value)}
          {summary.turnover_before_pct > summary.turnover_after_pct + 0.05 ? ` (planned ${round1(summary.turnover_before_pct)}%)` : ''}
          {' '}· limit {summary.limits.max_turnover_pct}% · max position {summary.limits.max_position_pct}% · cash buffer{' '}
          {summary.limits.min_cash_buffer_pct}% · drift ≥ {summary.limits.drift_threshold_pct}%
          {summary.limits.max_single_order_usd !== null ? ` · max order ${formatUsd(summary.limits.max_single_order_usd)}` : ''}
        </p>
        {summary.forced_sell_count > 0 && (
          <p className="mt-1">{summary.forced_sell_count} Shariah-required sell(s) are always placed in full.</p>
        )}
        {adjustments.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {adjustments.map((a, i) => (
              <li key={`${a.ticker}-${a.action}-${a.rule}-${i}`}>
                <span className="font-mono font-bold">{a.ticker}</span> {a.action.toUpperCase()}{' '}
                <span className={a.outcome === 'blocked' ? 'font-semibold text-red-700' : 'font-semibold text-amber-700'}>
                  {a.outcome === 'blocked' ? 'blocked' : `trimmed ${formatUsd(a.before_usd)} → ${formatUsd(a.after_usd)}`}
                </span>
                {' — '}{a.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">No orders were trimmed or blocked.</p>
        )}
      </div>
    </div>
  )
}
