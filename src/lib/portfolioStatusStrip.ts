import { hubHref, settingsHref } from '@/lib/portfolioHub'
import type { AutopilotMode } from '@/lib/schedule'
import { describeScreeningConfig, isFullScreening, screeningModeLabel, type EffectiveScreeningConfig } from '@/lib/screeningConfig'

/**
 * Pure chip builder for the Portfolio hub's global status strip (specs/028-portfolio-hub-ux-cleanup).
 * Chips only appear when relevant; every input may be missing (Alpaca unreachable, migration not applied…).
 */

export type StatusChipTone = 'paused' | 'approval' | 'setup' | 'paper' | 'live' | 'dry_run' | 'autopilot' | 'shariah_on' | 'shariah_reduced'

export interface StatusChip {
  key: 'paused' | 'approval' | 'setup' | 'account' | 'dry_run' | 'autopilot' | 'shariah'
  label: string
  tone: StatusChipTone
  href: string | null
  /** Tooltip / accessible description. */
  title: string | null
}

export interface StatusStripInput {
  /** Alpaca connection (from stored credentials — no live call). Null when not connected or unknown. */
  connection: { isPaper: boolean } | null
  dryRun: boolean
  tradingPaused: boolean
  pausedReason: string | null
  autopilotMode: AutopilotMode
  nextRunAt: string | null
  /** Latest scheduled recommendation still awaiting approval. */
  pendingApproval: { expiresInMs: number } | null
  /** Getting-started progress; null when unknown. */
  setup: { doneCount: number; total: number; complete: boolean } | null
  /** Current effective screening config (specs/030); omitted → no screening chip. */
  screening?: EffectiveScreeningConfig | null
}

export const AUTOPILOT_MODE_LABEL: Record<AutopilotMode, string> = {
  off:      'Off',
  approval: 'Scheduled + approval',
  auto:     'Fully automatic',
}

const AUTOPILOT_MODE_SHORT: Record<AutopilotMode, string> = {
  off:      'off',
  approval: 'approval',
  auto:     'auto',
}

/** "5h" / "40m" / "under 1m" — compact remaining time for a chip. */
export function formatCompactDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return 'under 1m'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

/** "Mon 10:30 NY" — the next scheduled run in New York time. Null for a missing or invalid timestamp. */
export function formatNextRunShort(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  const weekday = d.toLocaleString('en-GB', { timeZone: 'America/New_York', weekday: 'short' })
  const time = d.toLocaleString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })
  return `${weekday} ${time} NY`
}

/** Chips in urgency order: paused, approval needed, setup, then the account / mode chips. */
export function buildStatusChips(input: StatusStripInput): StatusChip[] {
  const chips: StatusChip[] = []

  if (input.tradingPaused) {
    chips.push({
      key:   'paused',
      label: 'TRADING PAUSED',
      tone:  'paused',
      href:  settingsHref('safety'),
      title: input.pausedReason ? `Reason: ${input.pausedReason}` : 'Trading is paused — no orders will be placed.',
    })
  }

  if (input.pendingApproval && input.pendingApproval.expiresInMs > 0) {
    chips.push({
      key:   'approval',
      label: `Approval needed · expires in ${formatCompactDuration(input.pendingApproval.expiresInMs)}`,
      tone:  'approval',
      href:  hubHref({ tab: 'rebalance' }),
      title: 'A scheduled analysis is waiting for you to approve or reject its trades.',
    })
  }

  if (input.setup && !input.setup.complete && input.setup.total > 0) {
    chips.push({
      key:   'setup',
      label: `Setup ${input.setup.doneCount}/${input.setup.total}`,
      tone:  'setup',
      href:  settingsHref('setup'),
      title: 'Finish the getting-started steps in Settings → Setup.',
    })
  }

  if (input.connection) {
    chips.push({
      key:   'account',
      label: input.connection.isPaper ? 'PAPER' : 'LIVE',
      tone:  input.connection.isPaper ? 'paper' : 'live',
      href:  null,
      title: input.connection.isPaper ? 'Alpaca paper-trading account' : 'Alpaca live-money account',
    })
  }

  if (input.dryRun) {
    chips.push({
      key:   'dry_run',
      label: 'DRY RUN',
      tone:  'dry_run',
      href:  settingsHref('safety'),
      title: 'Executions are simulated — nothing is sent to Alpaca.',
    })
  }

  if (input.autopilotMode !== 'off') {
    const next = formatNextRunShort(input.nextRunAt) ?? 'trading day 10:30 NY'
    chips.push({
      key:   'autopilot',
      label: `Autopilot: ${AUTOPILOT_MODE_SHORT[input.autopilotMode]} · next ${next}`,
      tone:  'autopilot',
      href:  settingsHref('automation'),
      title: `Autopilot: ${AUTOPILOT_MODE_LABEL[input.autopilotMode]}`,
    })
  }

  if (input.screening) {
    chips.push({
      key:   'shariah',
      label: screeningModeLabel(input.screening),
      tone:  isFullScreening(input.screening) ? 'shariah_on' : 'shariah_reduced',
      href:  settingsHref('strategy'),
      title: describeScreeningConfig(input.screening),
    })
  }

  return chips
}
