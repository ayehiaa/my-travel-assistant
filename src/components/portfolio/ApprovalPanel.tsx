'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { formatDuration, type ApprovalStatus, type AutoExecutionOutcome } from '@/lib/autopilot'

interface Props {
  recommendationId: string
  /** Effective status (expiry already applied on the server). */
  status: ApprovalStatus | null
  /** Milliseconds left in the approval window when the page was rendered. */
  initialRemainingMs: number
  isLatest: boolean
  hasBlockingExecution: boolean
  dryRun: boolean
  isPaper: boolean
  tradingPaused: boolean
  autoExecution: AutoExecutionOutcome | null
}

const STATUS_CHIP: Record<ApprovalStatus, { label: string; className: string }> = {
  pending:  { label: 'Pending approval', className: 'bg-blue-100 text-blue-800' },
  approved: { label: 'Approved',         className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected',         className: 'bg-gray-200 text-gray-700' },
  expired:  { label: 'Expired',          className: 'bg-amber-100 text-amber-800' },
}

/** Approval panel for scheduled (autopilot) recommendations. Self-contained (moves to the hub in phase 6). */
export default function ApprovalPanel({
  recommendationId,
  status,
  initialRemainingMs,
  isLatest,
  hasBlockingExecution,
  dryRun,
  isPaper,
  tradingPaused,
  autoExecution,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs)
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null)

  useEffect(() => {
    if (status !== 'pending') return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setRemainingMs(Math.max(0, initialRemainingMs - (Date.now() - startedAt)))
    }, 30_000)
    return () => clearInterval(timer)
  }, [status, initialRemainingMs])

  const expiredNow = status === 'pending' && remainingMs <= 0
  const shownStatus: ApprovalStatus | null = expiredNow ? 'expired' : status
  const canDecide = shownStatus === 'pending' && !hasBlockingExecution
  const canApprove = canDecide && isLatest && !tradingPaused

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision)
    try {
      const res = await fetch(`/api/portfolio/recommendations/${recommendationId}/${decision}`, { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        toast(data.error ?? `Could not ${decision} the recommendation`, 'error')
        return
      }
      toast(
        decision === 'approve'
          ? dryRun ? 'Approved — simulated execution started (dry run)' : 'Approved — execution started'
          : 'Recommendation rejected',
        'success',
      )
      router.refresh()
    } catch {
      toast(`Could not ${decision} the recommendation`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-blue-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">Autopilot — scheduled run</h2>
        {shownStatus && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CHIP[shownStatus].className}`}>
            {STATUS_CHIP[shownStatus].label}
          </span>
        )}
      </div>

      {autoExecution && (
        <p className="mt-2 text-sm text-gray-700">
          Automatic execution:{' '}
          {autoExecution.status === 'requested'
            ? 'requested — see the execution results below.'
            : `skipped — ${autoExecution.reason ?? 'not executed'}.`}
        </p>
      )}

      {shownStatus === 'pending' && (
        <>
          <p className="mt-2 text-sm text-gray-700">
            Expires in <span className="font-semibold">{formatDuration(remainingMs)}</span>. If you do nothing, nothing is
            executed.
          </p>
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="font-semibold">What happens on approve: </span>
            {dryRun
              ? 'DRY RUN — the orders are planned with fresh prices and your risk limits and recorded as simulated. Nothing is sent to Alpaca.'
              : `LIVE — orders are placed on your ${isPaper ? 'paper' : 'live-money'} Alpaca account using fresh prices, within your risk limits and the Shariah screen.`}
          </div>
          {!isLatest && (
            <p className="mt-2 text-sm text-amber-800">A newer recommendation exists — this one can only be rejected.</p>
          )}
          {tradingPaused && (
            <p className="mt-2 text-sm text-red-700">Trading is paused — resume it in Portfolio Settings to approve.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => decide('approve')}
              disabled={!canApprove || busy !== null}
              className="rounded-lg bg-green-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              {busy === 'approve' ? 'Approving…' : 'Approve & execute'}
            </button>
            <button
              type="button"
              onClick={() => decide('reject')}
              disabled={!canDecide || busy !== null}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-800 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </>
      )}

      {shownStatus === 'expired' && (
        <p className="mt-2 text-sm text-gray-700">
          The 24-hour approval window has passed — nothing was executed. You can still execute manually below.
        </p>
      )}
      {shownStatus === 'rejected' && <p className="mt-2 text-sm text-gray-700">You rejected this recommendation.</p>}
    </section>
  )
}
