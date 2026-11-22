import { formatUsd } from '@/lib/portfolioCalculator'
import type { ActionItem } from '@/types/database'
import type { ShariahScreeningResult } from '@/types/shariah'

interface Props {
  actions: ActionItem[]
  screening: ShariahScreeningResult | null
}

const ACTION_CHIP: Record<ActionItem['action'], string> = {
  buy:  'bg-emerald-100 text-emerald-800',
  sell: 'bg-red-100 text-red-800',
  hold: 'bg-[var(--paper-3)] text-[var(--ink-3)]',
}

function ShariahChip({ ticker, screening }: { ticker: string; screening: ShariahScreeningResult | null }) {
  // Islamic screening was off for this run (specs/030): no Shariah chip.
  if (screening?.config && !screening.config.islamic) return null
  const t = screening?.tickers.find(s => s.ticker === ticker)
  if (!t) {
    return <span className="rounded-full bg-[var(--paper-3)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-3)]">Not screened</span>
  }
  return t.verdict === 'compliant'
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800" title={t.reasons[0]}>✓ Shariah</span>
    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title={t.reasons.join('; ')}>⚠ Not compliant</span>
}

/** Proposed trades as cards: action, $ change, weight change, Shariah chip and any forced-trade note. */
export default function ProposedTrades({ actions, screening }: Props) {
  const trades = [...actions].sort((a, b) => {
    const rank = (x: ActionItem) => (x.action === 'sell' ? 0 : x.action === 'buy' ? 1 : 2)
    return rank(a) - rank(b) || Math.abs(b.delta_usd) - Math.abs(a.delta_usd)
  })
  if (trades.length === 0) return <p className="text-sm text-[var(--ink-3)]">No trades proposed.</p>

  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {trades.map(item => (
        <li key={item.ticker} className="rounded-lg border border-[var(--rule)] p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${ACTION_CHIP[item.action]}`}>{item.action.toUpperCase()}</span>
              <span className="font-mono text-sm font-bold text-[var(--ink)]">{item.ticker}</span>
            </span>
            <span className={`font-mono text-sm font-semibold ${item.delta_usd > 0 ? 'text-emerald-700' : item.delta_usd < 0 ? 'text-red-700' : 'text-[var(--ink-3)]'}`}>
              {formatUsd(item.delta_usd)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--ink-3)]">
            <span className="font-mono">
              {item.current_pct.toFixed(1)}% → {item.target_pct.toFixed(1)}% · {formatUsd(item.target_usd)}
            </span>
            <ShariahChip ticker={item.ticker} screening={screening} />
          </div>
          {item.note && <p className="mt-1 text-xs text-red-700">{item.note}</p>}
        </li>
      ))}
    </ul>
  )
}
