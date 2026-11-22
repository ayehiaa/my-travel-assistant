import Link from 'next/link'
import {
  getCredentials,
  getPendingApproval,
  getSettingsRow,
  getSetupChecklist,
} from '@/lib/portfolioHubData'
import { readSafetySettings } from '@/lib/riskLimits'
import { readAutopilotSettings } from '@/lib/schedule'
import { effectiveScreeningConfig, readScreeningSettings } from '@/lib/screeningConfig'
import { buildStatusChips, type StatusChip, type StatusChipTone } from '@/lib/portfolioStatusStrip'

const TONE_CLASS: Record<StatusChipTone, string> = {
  paused:    'bg-red-600 text-white',
  approval:  'bg-[var(--blue-700)] text-white',
  setup:     'bg-amber-100 text-amber-900',
  paper:     'bg-amber-100 text-amber-800',
  live:      'bg-emerald-100 text-emerald-800',
  dry_run:   'bg-purple-600 text-white font-mono',
  autopilot: 'bg-[var(--paper-3)] text-[var(--ink-2)]',
  shariah_on:      'bg-emerald-50 text-emerald-800',
  shariah_reduced: 'bg-amber-100 text-amber-900',
}

/** Resolve a loader, falling back when it throws (a missing piece of data just hides its chip). */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch {
    return fallback
  }
}

function Chip({ chip }: { chip: StatusChip }) {
  const className = `inline-block max-w-full truncate rounded-full px-2.5 py-1 text-xs font-bold ${TONE_CLASS[chip.tone]}`
  if (chip.href) {
    return (
      <Link href={chip.href} title={chip.title ?? undefined} className={`${className} hover:opacity-90`}>
        {chip.label}
      </Link>
    )
  }
  return <span title={chip.title ?? undefined} className={className}>{chip.label}</span>
}

/**
 * Global status strip above the hub tabs (specs/028-portfolio-hub-ux-cleanup): compact chips that only appear when
 * relevant. Reads stored settings / credentials only (no live Alpaca call) and never throws.
 */
export default async function StatusStrip({ userId, email }: { userId: string; email: string }) {
  const [settingsRow, creds, pending, checklist] = await Promise.all([
    safe(getSettingsRow(userId), null),
    safe(getCredentials(userId), null),
    safe(getPendingApproval(userId), null),
    safe(getSetupChecklist(userId, email), null),
  ])
  const safety = readSafetySettings(settingsRow)
  const autopilot = readAutopilotSettings(settingsRow)

  const chips = buildStatusChips({
    connection:      creds ? { isPaper: creds.isPaper } : null,
    dryRun:          safety.dry_run,
    tradingPaused:   safety.trading_paused,
    pausedReason:    safety.paused_reason,
    autopilotMode:   autopilot.mode,
    nextRunAt:       autopilot.next_run_at,
    pendingApproval: pending,
    setup:           checklist ? { doneCount: checklist.doneCount, total: checklist.items.length, complete: checklist.complete } : null,
    screening:       effectiveScreeningConfig(readScreeningSettings(settingsRow)),
  })
  if (chips.length === 0) return null

  return (
    <ul aria-label="Portfolio status" className="mb-4 flex min-w-0 flex-wrap gap-2">
      {chips.map(chip => (
        <li key={chip.key} className="min-w-0 max-w-full">
          <Chip chip={chip} />
          {chip.key === 'paused' && chip.title && <span className="sr-only">{chip.title}</span>}
        </li>
      ))}
    </ul>
  )
}
