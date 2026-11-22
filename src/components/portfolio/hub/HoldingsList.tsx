'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatSignedPct, formatSignedUsd, type TickerTrade } from '@/lib/portfolioHub'
import { formatUsd } from '@/lib/portfolioCalculator'

export interface HoldingShariahView {
  kind: 'compliant' | 'flagged' | 'unscreened' | 'off'
  reason: string | null
  /** Pre-formatted ratio rows (label, value text, pass/fail/unknown, source). */
  ratios: Array<{ label: string; value: string; status: 'pass' | 'fail' | 'unknown'; source: string }>
  ratioSource: string | null
  nonPermissibleIncomePct: number | null
  screenedAt: string | null
  recommendationId: string | null
}

export interface HoldingView {
  ticker: string
  company_name: string
  qty: number
  value_usd: number
  pct_of_portfolio: number
  avg_entry_price: number | null
  current_price: number | null
  cost_basis: number | null
  unrealized_pl: number | null
  unrealized_plpc: number | null
  shariah: HoldingShariahView
  trades: TickerTrade[]
}

function ShariahChip({ shariah }: { shariah: HoldingShariahView }) {
  if (shariah.kind === 'compliant') {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">✓ Shariah</span>
  }
  if (shariah.kind === 'flagged') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title={shariah.reason ?? undefined}>
        ⚠ Flagged
      </span>
    )
  }
  return <span className="rounded-full bg-[var(--paper-3)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-3)]">Not screened</span>
}

function plClass(v: number | null): string {
  if (v === null || v === 0) return 'text-[var(--ink-3)]'
  return v > 0 ? 'text-emerald-700' : 'text-red-700'
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(4).replace(/0+$/, '')
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
}

/** Holdings as tappable cards; a holding opens a detail drawer (bottom sheet on mobile, side panel on desktop). */
export default function HoldingsList({ holdings }: { holdings: HoldingView[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const holding = holdings.find(h => h.ticker === selected) ?? null

  useEffect(() => {
    if (!holding) return
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [holding])

  return (
    <>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {holdings.map(h => (
          <li key={h.ticker}>
            <button
              type="button"
              onClick={() => setSelected(h.ticker)}
              className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-[var(--paper-2)] focus:bg-[var(--paper-2)] focus:outline-none md:px-2"
              aria-haspopup="dialog"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[var(--ink)]">{h.ticker}</span>
                  <ShariahChip shariah={h.shariah} />
                </span>
                <span className="block truncate text-xs text-[var(--ink-3)]">
                  {h.company_name} · {formatQty(h.qty)} sh · {h.pct_of_portfolio.toFixed(1)}%
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm font-semibold text-[var(--ink)]">{formatUsd(h.value_usd)}</span>
                {h.unrealized_pl !== null && (
                  <span className={`block font-mono text-xs ${plClass(h.unrealized_pl)}`}>
                    {formatSignedUsd(h.unrealized_pl)}
                    {h.unrealized_plpc !== null && ` (${formatSignedPct(h.unrealized_plpc * 100)})`}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {holding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end">
          <button type="button" aria-label="Close details" className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="holding-drawer-title"
            className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 id="holding-drawer-title" className="font-mono text-xl font-bold text-[var(--ink)]">{holding.ticker}</h3>
                <p className="text-sm text-[var(--ink-3)]">{holding.company_name}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--ink-3)] hover:bg-[var(--paper-2)]"
              >
                Close
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--paper-2)] p-4 text-sm">
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Market value</dt>
                <dd className="font-mono font-semibold text-[var(--ink)]">{formatUsd(holding.value_usd)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Unrealised P&amp;L</dt>
                <dd className={`font-mono font-semibold ${plClass(holding.unrealized_pl)}`}>
                  {holding.unrealized_pl !== null ? formatSignedUsd(holding.unrealized_pl) : '—'}
                  {holding.unrealized_plpc !== null && (
                    <span className="block text-xs">{formatSignedPct(holding.unrealized_plpc * 100)}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Shares</dt>
                <dd className="font-mono text-[var(--ink)]">{formatQty(holding.qty)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Avg entry</dt>
                <dd className="font-mono text-[var(--ink)]">{holding.avg_entry_price !== null ? formatUsd(holding.avg_entry_price) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Current price</dt>
                <dd className="font-mono text-[var(--ink)]">{holding.current_price !== null ? formatUsd(holding.current_price) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ink-3)]">Cost basis</dt>
                <dd className="font-mono text-[var(--ink)]">{holding.cost_basis !== null ? formatUsd(holding.cost_basis) : '—'}</dd>
              </div>
            </dl>

            <section className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--ink)]">Shariah screening</h4>
                <ShariahChip shariah={holding.shariah} />
              </div>
              {holding.shariah.kind === 'off' ? (
                <p className="text-sm text-[var(--ink-3)]">
                  Islamic screening is off — holdings are not screened. Turn it on in Settings → Strategy.
                </p>
              ) : holding.shariah.kind === 'unscreened' ? (
                <p className="text-sm text-[var(--ink-3)]">
                  Not in the latest screening. The next analysis run screens every holding.
                </p>
              ) : (
                <>
                  {holding.shariah.reason && <p className="mb-2 text-sm text-[var(--ink-2)]">{holding.shariah.reason}</p>}
                  <table className="w-full text-sm">
                    <tbody>
                      {holding.shariah.ratios.map(r => (
                        <tr key={r.label} className="border-b border-[var(--rule-soft)]">
                          <td className="py-1.5 pr-2 text-[var(--ink-3)]">{r.label}</td>
                          <td
                            className={`py-1.5 pr-2 text-right font-mono ${
                              r.status === 'pass' ? 'text-emerald-700' : r.status === 'fail' ? 'text-red-700' : 'text-[var(--ink-3)]'
                            }`}
                          >
                            {r.value}
                          </td>
                          <td className="py-1.5 text-right text-xs text-[var(--ink-4)]">{r.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {holding.shariah.nonPermissibleIncomePct !== null && (
                    <p className="mt-1 text-xs text-[var(--ink-3)]">
                      Non-permissible income ≈ {holding.shariah.nonPermissibleIncomePct.toFixed(1)}% of revenue
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--ink-4)]">
                    Source: {holding.shariah.ratioSource === 'polygon' ? 'Polygon financials' : 'Polygon + AI estimate'}
                    {holding.shariah.screenedAt ? ` · screened ${formatDate(holding.shariah.screenedAt)}` : ''}
                  </p>
                </>
              )}
            </section>

            <section className="mt-5">
              <h4 className="mb-2 text-sm font-semibold text-[var(--ink)]">Recent trades</h4>
              {holding.trades.length === 0 ? (
                <p className="text-sm text-[var(--ink-3)]">No trades placed through the app for this stock yet.</p>
              ) : (
                <ul className="space-y-2">
                  {holding.trades.map((t, i) => (
                    <li key={`${t.recommendation_id}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${t.action === 'buy' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {t.action.toUpperCase()}
                        </span>
                        <span className="font-mono">{formatQty(t.qty)}</span>
                        {t.price !== null && <span className="text-[var(--ink-3)]"> @ {formatUsd(t.price)}</span>}
                        <span className="block text-xs text-[var(--ink-4)]">
                          {formatDate(t.executed_at)} · {t.dry_run ? 'dry run' : t.status.replace('_', ' ')}
                        </span>
                      </span>
                      <Link href={`/portfolio/recommendations/${t.recommendation_id}`} className="text-xs font-semibold text-[var(--blue-700)]">
                        Details →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  )
}
