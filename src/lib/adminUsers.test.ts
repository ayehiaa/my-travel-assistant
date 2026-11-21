import { describe, it, expect } from 'vitest'
import { AdminUserPatchSchema, buildAdminUserRow, latestRunByUser, planUserPatch, sortAdminUserRows } from './adminUsers'

describe('AdminUserPatchSchema (admin PATCH validation)', () => {
  it('accepts plan and/or the full add-on list', () => {
    expect(AdminUserPatchSchema.safeParse({ plan: 'plus' }).success).toBe(true)
    expect(AdminUserPatchSchema.safeParse({ features: [] }).success).toBe(true)
    expect(AdminUserPatchSchema.safeParse({ plan: 'free', features: ['portfolio'] }).success).toBe(true)
  })
  it('rejects empty bodies, unknown values and attempts to change other fields', () => {
    expect(AdminUserPatchSchema.safeParse({}).success).toBe(false)
    expect(AdminUserPatchSchema.safeParse({ plan: 'premium' }).success).toBe(false)
    expect(AdminUserPatchSchema.safeParse({ features: ['admin'] }).success).toBe(false)
    expect(AdminUserPatchSchema.safeParse({ features: 'portfolio' }).success).toBe(false)
    expect(AdminUserPatchSchema.safeParse({ plan: 'plus', isAdmin: true }).success).toBe(false)
    expect(AdminUserPatchSchema.safeParse({ plan: 'plus', account_type: 'member' }).success).toBe(false)
    expect(AdminUserPatchSchema.safeParse({ role: 'premium_plus' }).success).toBe(false)
  })
})

describe('planUserPatch', () => {
  it('refuses assistants (they inherit from the linked member)', () => {
    expect(planUserPatch({ role: 'assistant' }, { plan: 'plus' })).toEqual({ ok: false, reason: 'assistant' })
  })
  it('changes the plan only', () => {
    const p = planUserPatch({ role: 'premium_plus' }, { plan: 'free' })
    expect(p).toMatchObject({ ok: true, planChanged: true, featuresChanged: false, portfolioRemoved: false })
    if (p.ok) expect(p.next).toEqual({ accountType: 'member', plan: 'free', features: ['portfolio'] })
  })
  it('detects Portfolio removal', () => {
    const p = planUserPatch({ account_type: 'member', plan: 'plus', features: ['portfolio'] }, { features: [] })
    expect(p).toMatchObject({ ok: true, planChanged: false, featuresChanged: true, portfolioRemoved: true })
  })
  it('adding Portfolio is not a removal; no-ops are detected', () => {
    expect(planUserPatch({ role: 'main' }, { features: ['portfolio'] })).toMatchObject({ featuresChanged: true, portfolioRemoved: false })
    expect(planUserPatch({ role: 'premium' }, { plan: 'plus', features: [] })).toMatchObject({ planChanged: false, featuresChanged: false })
  })
})

describe('buildAdminUserRow', () => {
  const base = {
    email: 'a@example.com',
    isAdmin: false,
    linkedMainAccounts: [],
    termsAcceptedAt: null,
    alpacaIsPaper: null,
    aiKeyAdded: null,
    lastRun: null,
    settingsRow: null,
  }
  it('uses safe defaults without settings (dry run on, autopilot off, not paused)', () => {
    const row = buildAdminUserRow({ ...base, roleRow: { user_id: 'u1', display_name: 'Ann', role: 'premium_plus', created_at: '2026-01-01T00:00:00Z' } })
    expect(row).toMatchObject({
      id: 'u1', displayName: 'Ann', accountType: 'member', plan: 'plus', features: ['portfolio'], status: 'active', source: 'legacy_role',
      portfolio: { alpaca: null, aiKeyAdded: null, autopilotMode: 'off', dryRun: true, tradingPaused: false },
    })
  })
  it('maps Alpaca paper/live and settings', () => {
    const row = buildAdminUserRow({
      ...base, alpacaIsPaper: false, aiKeyAdded: true, lastRun: { at: '2026-11-20T15:30:00Z', status: 'complete' },
      roleRow: { user_id: 'u1', display_name: 'Ann', account_type: 'member', plan: 'free', features: ['portfolio'] },
      settingsRow: { autopilot_mode: 'approval', dry_run: false, trading_paused: true },
    })
    expect(row.portfolio).toMatchObject({ alpaca: 'live', aiKeyAdded: true, autopilotMode: 'approval', dryRun: false, tradingPaused: true })
    expect(row.source).toBe('columns')
  })
  it('shows linked accounts only for assistants and admin only for members', () => {
    const linked = [{ id: 'm1', displayName: 'Main' }]
    const assistant = buildAdminUserRow({ ...base, isAdmin: true, linkedMainAccounts: linked, roleRow: { user_id: 'a1', role: 'assistant', status: 'deactivated' } })
    expect(assistant).toMatchObject({ accountType: 'assistant', isAdmin: false, linkedMainAccounts: linked, status: 'deactivated' })
    const member = buildAdminUserRow({ ...base, isAdmin: true, linkedMainAccounts: linked, roleRow: { user_id: 'm1', role: 'main' } })
    expect(member).toMatchObject({ isAdmin: true, linkedMainAccounts: [] })
  })
})

describe('latestRunByUser / sortAdminUserRows', () => {
  it('keeps the first (newest) run per user', () => {
    const map = latestRunByUser([
      { user_id: 'a', run_at: '2026-11-20', status: 'complete' },
      { user_id: 'b', run_at: '2026-11-19', status: 'error' },
      { user_id: 'a', run_at: '2026-11-01', status: 'error' },
    ])
    expect(map.get('a')).toEqual({ at: '2026-11-20', status: 'complete' })
    expect(map.get('b')).toEqual({ at: '2026-11-19', status: 'error' })
  })
  it('sorts admins, then members, then assistants, by name', () => {
    const mk = (id: string, name: string, role: string, isAdmin = false) =>
      buildAdminUserRow({ email: '', isAdmin, linkedMainAccounts: [], termsAcceptedAt: null, alpacaIsPaper: null, aiKeyAdded: null, lastRun: null, settingsRow: null, roleRow: { user_id: id, display_name: name, role } })
    const sorted = sortAdminUserRows([mk('1', 'Zed', 'assistant'), mk('2', 'Bob', 'main'), mk('3', 'Amy', 'main'), mk('4', 'Owner', 'premium_plus', true)])
    expect(sorted.map(r => r.displayName)).toEqual(['Owner', 'Amy', 'Bob', 'Zed'])
  })
})
