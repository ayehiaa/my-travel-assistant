import Link from 'next/link'
import { formatDuration } from '@/lib/autopilot'
import { formatRunTime, type AutopilotMode } from '@/lib/schedule'

interface Props {
  mode: AutopilotMode
  nextRunAt: string | null
  /** Latest scheduled recommendation still awaiting approval, if any. */
  pending: { recommendationId: string; expiresInMs: number } | null
}

const MODE_LABEL: Record<AutopilotMode, string> = {
  off:      'Off',
  approval: 'Scheduled + approval',
  auto:     'Fully automatic',
}

/** Portfolio-page autopilot status line + "Pending approval" card. Self-contained (moves to the hub in phase 6). */
export default function AutopilotStatus({ mode, nextRunAt, pending }: Props) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700">
        <span className="font-semibold text-gray-900">Autopilot:</span>
        <span>{MODE_LABEL[mode]}</span>
        {mode !== 'off' && (
          <span className="text-gray-500">
            · Next run {nextRunAt ? formatRunTime(nextRunAt) : 'next trading day at 10:30 New York time'}
          </span>
        )}
        <Link href="/portfolio/settings" className="ml-auto text-xs font-semibold text-blue-700 underline">
          Change
        </Link>
      </div>
      {pending && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3" role="status">
          <p className="text-sm font-bold text-blue-900">
            Pending approval — expires in {formatDuration(pending.expiresInMs)}
          </p>
          <p className="mt-1 text-sm text-blue-900">
            A scheduled analysis is ready. Review it and approve or reject the trades.
          </p>
          <Link
            href={`/portfolio/recommendations/${pending.recommendationId}`}
            className="mt-2 inline-block rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white"
          >
            Review recommendation
          </Link>
        </div>
      )}
    </div>
  )
}
