import { describe, it, expect } from 'vitest'
import { buildStatusChips, formatCompactDuration, formatNextRunShort, type StatusStripInput } from './portfolioStatusStrip'

const base: StatusStripInput = {
  connection:      null,
  dryRun:          false,
  tradingPaused:   false,
  pausedReason:    null,
  autopilotMode:   'off',
  nextRunAt:       null,
  pendingApproval: null,
  setup:           null,
}

describe('formatCompactDuration', () => {
  it('shows hours from one hour, minutes below', () => {
    expect(formatCompactDuration(5 * 3600_000 + 59 * 60_000)).toBe('5h')
    expect(formatCompactDuration(40 * 60_000)).toBe('40m')
    expect(formatCompactDuration(30_000)).toBe('under 1m')
    expect(formatCompactDuration(Number.NaN)).toBe('under 1m')
  })
})

describe('formatNextRunShort', () => {
  it('formats in New York time', () => {
    // Monday 2026-11-23 15:30 UTC = 10:30 New York (EST)
    expect(formatNextRunShort('2026-11-23T15:30:00Z')).toBe('Mon 10:30 NY')
  })
  it('returns null for missing or invalid input', () => {
    expect(formatNextRunShort(null)).toBeNull()
    expect(formatNextRunShort('nope')).toBeNull()
  })
})

describe('buildStatusChips', () => {
  it('shows nothing when nothing is relevant', () => {
    expect(buildStatusChips(base)).toEqual([])
  })

  it('shows PAPER / LIVE only when connected', () => {
    expect(buildStatusChips({ ...base, connection: { isPaper: true } }).map(c => c.label)).toEqual(['PAPER'])
    const live = buildStatusChips({ ...base, connection: { isPaper: false } })
    expect(live[0]).toMatchObject({ label: 'LIVE', tone: 'live', href: null })
  })

  it('DRY RUN links to Settings → Safety', () => {
    const [chip] = buildStatusChips({ ...base, dryRun: true })
    expect(chip).toMatchObject({ key: 'dry_run', tone: 'dry_run', href: '/portfolio?tab=settings&section=safety' })
  })

  it('TRADING PAUSED carries the reason as its title and links to Safety', () => {
    const [chip] = buildStatusChips({ ...base, tradingPaused: true, pausedReason: 'Daily loss stop' })
    expect(chip).toMatchObject({ label: 'TRADING PAUSED', title: 'Reason: Daily loss stop', href: '/portfolio?tab=settings&section=safety' })
    expect(buildStatusChips({ ...base, tradingPaused: true })[0].title).toMatch(/paused/)
  })

  it('approval chip shows remaining hours and links to Rebalance; expired approvals are hidden', () => {
    const [chip] = buildStatusChips({ ...base, pendingApproval: { expiresInMs: 3 * 3600_000 + 5 * 60_000 } })
    expect(chip).toMatchObject({ label: 'Approval needed · expires in 3h', href: '/portfolio?tab=rebalance' })
    expect(buildStatusChips({ ...base, pendingApproval: { expiresInMs: 0 } })).toEqual([])
  })

  it('setup chip only while the checklist is incomplete', () => {
    const [chip] = buildStatusChips({ ...base, setup: { doneCount: 2, total: 4, complete: false } })
    expect(chip).toMatchObject({ label: 'Setup 2/4', href: '/portfolio?tab=settings&section=setup' })
    expect(buildStatusChips({ ...base, setup: { doneCount: 4, total: 4, complete: true } })).toEqual([])
  })

  it('autopilot chip shows mode and next run; hidden when off', () => {
    const [chip] = buildStatusChips({ ...base, autopilotMode: 'approval', nextRunAt: '2026-11-23T15:30:00Z' })
    expect(chip).toMatchObject({ label: 'Autopilot: approval · next Mon 10:30 NY', href: '/portfolio?tab=settings&section=automation' })
    expect(buildStatusChips({ ...base, autopilotMode: 'auto' })[0].label).toBe('Autopilot: auto · next trading day 10:30 NY')
    expect(buildStatusChips({ ...base, autopilotMode: 'off', nextRunAt: '2026-11-23T15:30:00Z' })).toEqual([])
  })

  it('orders chips by urgency', () => {
    const chips = buildStatusChips({
      connection:      { isPaper: true },
      dryRun:          true,
      tradingPaused:   true,
      pausedReason:    null,
      autopilotMode:   'approval',
      nextRunAt:       null,
      pendingApproval: { expiresInMs: 3600_000 },
      setup:           { doneCount: 3, total: 4, complete: false },
    })
    expect(chips.map(c => c.key)).toEqual(['paused', 'approval', 'setup', 'account', 'dry_run', 'autopilot'])
  })
})

describe('screening chip (specs/030)', () => {
  const input: StatusStripInput = {
    connection: null, dryRun: false, tradingPaused: false, pausedReason: null, autopilotMode: 'off',
    nextRunAt: null, pendingApproval: null, setup: null,
  }
  it('shows the active mode and links to Strategy settings', () => {
    const full = buildStatusChips({ ...input, screening: { islamic: true, business: true, financial: true, stocks_only: true } })
    expect(full).toEqual([expect.objectContaining({ key: 'shariah', label: 'Shariah: on', tone: 'shariah_on' })])
    expect(full[0].href).toContain('strategy')
    const biz = buildStatusChips({ ...input, screening: { islamic: true, business: true, financial: false, stocks_only: true } })
    expect(biz[0]).toMatchObject({ label: 'Shariah: business only', tone: 'shariah_reduced' })
    const off = buildStatusChips({ ...input, screening: { islamic: false, business: false, financial: false, stocks_only: false } })
    expect(off[0]).toMatchObject({ label: 'Shariah: off', title: 'Screening: Islamic screening off · ETFs / funds allowed' })
  })
  it('no chip when the config is not provided', () => {
    expect(buildStatusChips(input)).toEqual([])
  })
})
