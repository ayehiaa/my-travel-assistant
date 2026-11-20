'use client'

import { useEffect, useState } from 'react'
import type { AlpacaOrderStatus, ExecutionStatus, NormalizedExecution } from '@/types/database'
import { formatQty, formatUsd } from './AlpacaOrderPreview'

interface Props {
  execution: NormalizedExecution
}

const POLL_INTERVAL_MS = 4000
const TERMINAL: ExecutionStatus[] = ['completed', 'completed_with_errors', 'failed']

const ORDER_CHIP: Record<AlpacaOrderStatus, { label: string; className: string }> = {
  planned:          { label: 'Queued',           className: 'bg-gray-100 text-gray-600' },
  submitted:        { label: 'Submitted',        className: 'bg-blue-100 text-blue-700' },
  partially_filled: { label: 'Partially filled', className: 'bg-amber-100 text-amber-800' },
  filled:           { label: 'Filled',           className: 'bg-green-100 text-green-700' },
  canceled:         { label: 'Cancelled',        className: 'bg-gray-200 text-gray-700' },
  expired:          { label: 'Expired',          className: 'bg-gray-200 text-gray-700' },
  rejected:         { label: 'Rejected',         className: 'bg-red-100 text-red-700' },
  error:            { label: 'Error',            className: 'bg-amber-100 text-amber-700' },
  skipped:          { label: 'Skipped',          className: 'bg-gray-100 text-gray-500' },
}

const EXECUTION_LABEL: Record<ExecutionStatus, { label: string; className: string }> = {
  pending:               { label: 'Queued',                  className: 'bg-gray-100 text-gray-700' },
  waiting_for_market:    { label: 'Waiting for market open', className: 'bg-amber-100 text-amber-800' },
  executing:             { label: 'Executing',               className: 'bg-blue-100 text-blue-700' },
  completed:             { label: 'Completed',               className: 'bg-green-100 text-green-700' },
  completed_with_errors: { label: 'Completed with errors',   className: 'bg-amber-100 text-amber-800' },
  failed:                { label: 'Failed',                  className: 'bg-red-100 text-red-700' },
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AlpacaResultsPanel({ execution: initial }: Props) {
  const [execution, setExecution] = useState<NormalizedExecution>(initial)
  const isTerminal = TERMINAL.includes(execution.status)

  useEffect(() => {
    if (isTerminal) return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/portfolio/alpaca/executions/${execution.id}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { execution?: NormalizedExecution }
        if (!cancelled && data.execution) setExecution(data.execution)
      } catch {
        // transient — the next tick retries
      }
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [execution.id, isTerminal])

  const statusChip = EXECUTION_LABEL[execution.status]
  const formattedDate = new Date(execution.executed_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div className="mb-6 mt-4 rounded-[var(--r-xl)] border border-[var(--rule)] bg-white p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 font-[family-name:var(--display)] text-base font-bold text-[var(--ink)]">Execution Results</h3>
          {execution.is_paper && (
            <span className="inline-block rounded bg-blue-100 px-2 py-0.5 font-mono text-xs font-bold text-blue-700">PAPER</span>
          )}
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${statusChip.className}`}>
            {statusChip.label}
          </span>
          {!isTerminal && <span className="text-xs text-[var(--ink-3)]">Updating live…</span>}
        </div>
        <span className="text-[13px] text-[var(--ink-3)]">{formattedDate}</span>
      </div>

      {execution.status === 'waiting_for_market' && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          The market is closed. Orders will be placed shortly after the next open
          {execution.wait_until ? ` (around ${formatDateTime(execution.wait_until)})` : ''}.
        </p>
      )}
      {execution.error_message && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{execution.error_message}</p>
      )}

      {execution.orders.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          {isTerminal ? 'No orders were submitted.' : 'Orders will appear here once the market is open.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--rule)] text-left">
                {['Ticker', 'Action', 'Amount', 'Status', 'Filled', 'Order ID'].map(col => (
                  <th key={col} className="whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-3)]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {execution.orders.map((order, idx) => {
                const chip = ORDER_CHIP[order.status] ?? ORDER_CHIP.error
                const amount = typeof order.notional === 'number' && order.notional > 0
                  ? formatUsd(order.notional)
                  : order.qty > 0 ? `${formatQty(order.qty)} sh` : '—'
                const filled = (order.filled_qty ?? 0) > 0
                  ? `${formatQty(order.filled_qty ?? 0)} sh${order.filled_avg_price ? ` @ ${formatUsd(order.filled_avg_price)}` : ''}`
                  : '—'
                return (
                  <tr key={`${order.ticker}-${order.action}-${idx}`} className="border-b border-[var(--rule)] align-top">
                    <td className="px-3 py-3 font-mono font-bold text-[var(--ink)]">{order.ticker}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${order.action === 'buy' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {order.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[var(--ink-2)]">{amount}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${chip.className}`}>{chip.label}</span>
                      {order.error_message && (
                        <p className="mt-1 max-w-xs text-xs italic text-[var(--ink-3)]">{order.error_message}</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--ink-2)]">{filled}</td>
                    <td className="px-3 py-3">
                      {order.alpaca_order_id ? (
                        <span title={order.alpaca_order_id} className="font-mono text-xs text-[var(--ink-2)]">
                          {order.alpaca_order_id.slice(0, 8)}...
                        </span>
                      ) : (
                        <span className="text-[var(--ink-4)]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
