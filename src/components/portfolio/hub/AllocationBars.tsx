import { formatSignedPct, type AllocationRow } from '@/lib/portfolioHub'

interface Props {
  rows: AllocationRow[]
  title?: string
  /** Shown under the title, e.g. which recommendation the target comes from. */
  note?: string | null
  /** Drift (percentage points) from which a row is highlighted. */
  driftThreshold?: number
}

function pctText(v: number): string {
  return `${v.toFixed(1)}%`
}

/** Current vs target weight per ticker as horizontal bars (target = vertical marker) with drift. */
export default function AllocationBars({ rows, title = 'Allocation', note, driftThreshold = 5 }: Props) {
  const scaleMax = Math.max(25, ...rows.map(r => Math.max(r.current_pct, r.target_pct)))
  return (
    <section className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
        <span className="flex items-center gap-3 text-xs text-[var(--ink-3)]" aria-hidden="true">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-[var(--blue-500)]" />Current</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-[var(--ink)]" />Target</span>
        </span>
      </div>
      {note && <p className="-mt-1 mb-3 text-xs text-[var(--ink-3)]">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">Nothing to show yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(r => {
            const flagged = Math.abs(r.drift_pct) >= driftThreshold
            return (
              <li key={r.ticker}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-mono font-bold text-[var(--ink)]">{r.ticker === 'CASH' ? 'Cash' : r.ticker}</span>
                  <span className="flex items-baseline gap-2 font-mono text-xs text-[var(--ink-3)]">
                    <span>
                      {pctText(r.current_pct)} <span aria-hidden="true">→</span>
                      <span className="sr-only">current, target</span> {pctText(r.target_pct)}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        flagged ? 'bg-amber-100 text-amber-800' : 'bg-[var(--paper-2)] text-[var(--ink-3)]'
                      }`}
                      title="Drift: current minus target, percentage points"
                    >
                      {formatSignedPct(r.drift_pct, 1).replace('%', ' pp')}
                    </span>
                  </span>
                </div>
                <div
                  className="relative h-2.5 w-full overflow-visible rounded-full bg-[var(--paper-3)]"
                  role="img"
                  aria-label={`${r.ticker}: current ${pctText(r.current_pct)}, target ${pctText(r.target_pct)}`}
                >
                  <div
                    className={`h-full rounded-full ${r.ticker === 'CASH' ? 'bg-[var(--ink-4)]' : 'bg-[var(--blue-500)]'}`}
                    style={{ width: `${Math.min(100, (r.current_pct / scaleMax) * 100)}%` }}
                  />
                  {r.target_pct > 0 && (
                    <div
                      className="absolute -top-1 h-[18px] w-0.5 rounded bg-[var(--ink)]"
                      style={{ left: `calc(${Math.min(100, (r.target_pct / scaleMax) * 100)}% - 1px)` }}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
