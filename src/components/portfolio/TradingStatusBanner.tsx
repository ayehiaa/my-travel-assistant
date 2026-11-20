import Link from 'next/link'
import type { SafetySettings } from '@/lib/riskLimits'

interface Props {
  safety: SafetySettings
}

/** Portfolio-page status: red banner while trading is paused, DRY RUN badge while dry run is on. */
export default function TradingStatusBanner({ safety }: Props) {
  return (
    <div className="mb-6 space-y-3">
      {safety.trading_paused && (
        <div className="rounded-lg border border-red-400 bg-red-600 px-4 py-3 text-white" role="alert">
          <p className="text-sm font-bold">Trading is paused — no orders will be placed.</p>
          {safety.paused_reason && <p className="mt-1 text-sm">Reason: {safety.paused_reason}</p>}
          <Link href="/portfolio/settings" className="mt-1 inline-block text-sm font-semibold underline">
            Review in Portfolio Settings
          </Link>
        </div>
      )}
      {safety.dry_run && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-purple-300 bg-purple-50 px-4 py-2">
          <span className="rounded bg-purple-600 px-2 py-0.5 font-mono text-xs font-bold text-white">DRY RUN</span>
          <span className="text-sm text-purple-900">
            Executions are simulated — nothing is sent to Alpaca.
            {!safety.migration_applied && ' (Default until the safety database migration is applied.)'}
          </span>
        </div>
      )}
    </div>
  )
}
