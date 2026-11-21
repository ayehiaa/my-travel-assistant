export interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell' | 'hold'
  /** Shares for sells / whole-share buys; estimated shares for notional buys. */
  qty: number
  /** USD amount for notional (fractional) buys. Absent/null → a share-qty order. */
  notional?: number | null
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
  /** Set when the risk limits trimmed this order. */
  risk_note?: string | null
}

interface Props {
  preview: OrderPreviewItem[]
}

const ACTION_CHIP: Record<'buy' | 'sell' | 'hold', string> = {
  buy:  'bg-green-100 text-green-700',
  sell: 'bg-red-100 text-red-700',
  hold: 'bg-gray-100 text-gray-500',
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export function formatQty(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(value)
}

/** Buys show a dollar amount (notional); sells show the share quantity. */
function amountLabel(item: OrderPreviewItem): string {
  if (typeof item.notional === 'number' && item.notional > 0) {
    return `${formatUsd(item.notional)} (≈ ${formatQty(item.qty)} sh)`
  }
  return `${formatQty(item.qty)} sh`
}

export default function AlpacaOrderPreview({ preview }: Props) {
  const actionableItems = preview.filter(item => item.action !== 'hold')
  const hasActionable = actionableItems.some(item => !item.skipped)

  if (actionableItems.length === 0 || !hasActionable) {
    return (
      <div className="my-4">
        <p className="text-sm text-[var(--ink-3)]">No actionable orders</p>
        {actionableItems.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-[var(--ink-3)]">
            {actionableItems.map((item, idx) => (
              <li key={`${item.ticker}-${idx}`}>
                <span className="font-mono font-bold">{item.ticker}</span> {item.action.toUpperCase()} — {item.skip_reason ?? 'Skipped'}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Mobile: stacked cards (no horizontal scroll at 375px) */}
      <ul className="space-y-2 md:hidden">
        {actionableItems.map((item, idx) => (
          <li key={`${item.ticker}-${idx}`} className={`rounded-lg border border-[var(--rule)] p-3 text-sm ${item.skipped ? 'opacity-40' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${ACTION_CHIP[item.action]}`}>
                  {item.action.toUpperCase()}
                </span>
                <span className="font-mono font-bold text-[var(--ink)]">{item.ticker}</span>
              </span>
              <span className="shrink-0 font-mono text-[var(--ink)]">{item.skipped ? '—' : formatUsd(item.estimated_value)}</span>
            </div>
            <div className="mt-1 font-mono text-xs text-[var(--ink-2)]">
              {item.skipped ? (
                <span className="font-sans italic text-[var(--ink-3)]">{item.skip_reason ?? 'Skipped'}</span>
              ) : (
                <>
                  {amountLabel(item)}
                  {item.ask_price > 0 && ` · ask ${formatUsd(item.ask_price)}`}
                </>
              )}
            </div>
            {!item.skipped && item.risk_note && <p className="mt-1 text-xs text-amber-700">{item.risk_note}</p>}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-[var(--rule)] text-left">
            {['Ticker', 'Action', 'Amount', 'Ask Price', 'Est. Value'].map(col => (
              <th key={col} className="whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actionableItems.map((item, idx) => (
            <tr key={`${item.ticker}-${idx}`} className={`border-b border-[var(--rule)] ${item.skipped ? 'opacity-40' : ''}`}>
              <td className="px-3 py-3 font-mono font-bold text-[var(--ink)]">{item.ticker}</td>
              <td className="px-3 py-3">
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ACTION_CHIP[item.action]}`}>
                  {item.action.toUpperCase()}
                </span>
              </td>
              <td className="px-3 py-3 font-mono text-[var(--ink-2)]">
                {item.skipped ? (
                  <span className="font-sans italic text-[var(--ink-3)]">{item.skip_reason ?? 'Skipped'}</span>
                ) : (
                  <>
                    {amountLabel(item)}
                    {item.risk_note && (
                      <span className="mt-1 block font-sans text-xs text-amber-700">{item.risk_note}</span>
                    )}
                  </>
                )}
              </td>
              <td className="px-3 py-3 font-mono text-[var(--ink-2)]">
                {item.ask_price > 0 ? formatUsd(item.ask_price) : '—'}
              </td>
              <td className="px-3 py-3 font-mono text-[var(--ink)]">
                {item.skipped ? '—' : formatUsd(item.estimated_value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-3 text-xs text-[var(--ink-3)]">
        Sells are placed first. Buys are dollar-amount (fractional) market orders, sized to your settled cash once the
        sells have filled, and are only placed while the market is open.
      </p>
    </div>
  )
}
