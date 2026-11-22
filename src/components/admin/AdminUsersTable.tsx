'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { PLAN_INFO, type FeatureKey, type Plan } from '@/lib/access'
import type { AdminUserRow, PortfolioStatus } from '@/lib/adminUsers'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Chip({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' }) {
  const tones = {
    gray:   'bg-gray-100 text-gray-700',
    blue:   'bg-blue-100 text-blue-800',
    green:  'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-900',
    red:    'bg-red-100 text-red-800',
    purple: 'bg-purple-100 text-purple-800',
  }
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>
}

function PortfolioDetails({ p }: { p: PortfolioStatus }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-[var(--ink-2)]">
      <li>Terms: {p.termsAcceptedAt ? `accepted ${fmtDate(p.termsAcceptedAt)}` : 'not accepted'}</li>
      <li>Alpaca: {p.alpaca === null ? 'not connected' : p.alpaca === 'paper' ? 'paper' : <strong className="text-red-700">LIVE</strong>}</li>
      <li>AI key: {p.aiKeyAdded === null ? 'unknown' : p.aiKeyAdded ? 'added' : 'not added'}</li>
      <li>Last run: {p.lastRun ? `${fmtDate(p.lastRun.at)} (${p.lastRun.status})` : 'never'}</li>
      <li>Autopilot: {p.autopilotMode} · Dry run: {p.dryRun ? 'on' : <strong className="text-red-700">off</strong>}</li>
      {p.tradingPaused && <li><Chip tone="yellow">Trading paused</Chip></li>}
    </ul>
  )
}

export default function AdminUsersTable({ initial, currentUserId }: { initial: AdminUserRow[]; currentUserId: string }) {
  const toast = useToast()
  const [users, setUsers] = useState<AdminUserRow[]>(initial)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function patchUser(user: AdminUserRow, body: { plan?: Plan; features?: FeatureKey[] }) {
    setSavingId(user.id)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast(data.error ?? 'Could not update the user', 'error')
        return
      }
      setUsers(prev => prev.map(u => {
        if (u.id !== user.id) return u
        const removed = u.features.includes('portfolio') && !(data.features as FeatureKey[]).includes('portfolio')
        return {
          ...u,
          plan: data.plan,
          features: data.features,
          portfolio: removed
            ? { ...u.portfolio, tradingPaused: data.trading_paused === true || u.portfolio.tradingPaused, autopilotMode: data.autopilot_off ? 'off' : u.portfolio.autopilotMode }
            : u.portfolio,
        }
      }))
      if (data.warning) toast(data.warning, 'info')
      else toast(`Updated ${user.displayName}`, 'success')
    } catch {
      toast('Network error — the user was not updated', 'error')
    } finally {
      setSavingId(null)
    }
  }

  function toggleHealth(user: AdminUserRow) {
    const on = user.features.includes('health')
    if (on && !window.confirm(`Remove Health (beta) from ${user.displayName}? Their health data is kept but hidden until it is turned back on.`)) return
    const features: FeatureKey[] = on ? user.features.filter(f => f !== 'health') : [...user.features, 'health']
    void patchUser(user, { features })
  }

  function togglePortfolio(user: AdminUserRow) {
    const on = user.features.includes('portfolio')
    if (on && !window.confirm(
      `Remove Portfolio (beta) from ${user.displayName}? Their trading is paused, in-flight executions are cancelled and autopilot is turned off.`,
    )) return
    const features: FeatureKey[] = on ? user.features.filter(f => f !== 'portfolio') : [...user.features, 'portfolio']
    void patchUser(user, { features })
  }

  if (users.length === 0) {
    return <p className="text-sm text-[var(--ink-3)]">No users yet.</p>
  }

  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--rule)] text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
            <th className="px-3 py-2 font-bold">User</th>
            <th className="px-3 py-2 font-bold">Account</th>
            <th className="px-3 py-2 font-bold">Plan</th>
            <th className="px-3 py-2 font-bold">Portfolio (beta)</th>
            <th className="px-3 py-2 font-bold">Portfolio status</th>
            <th className="px-3 py-2 font-bold">Health (beta)</th>
            <th className="px-3 py-2 font-bold">Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => {
            const saving = savingId === u.id
            const isMember = u.accountType === 'member'
            return (
              <tr key={u.id} className="border-b border-[var(--rule-soft)] align-top">
                <td className="px-3 py-3">
                  <div className="font-semibold text-[var(--ink)]">
                    {u.displayName}
                    {u.id === currentUserId && <span className="ml-1 text-xs font-normal text-[var(--ink-3)]">(you)</span>}
                  </div>
                  <div className="text-xs text-[var(--ink-3)]">{u.email || '—'}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.isAdmin && <Chip tone="purple">Admin</Chip>}
                    {u.status === 'deactivated' && <Chip tone="red">Deactivated</Chip>}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Chip tone={isMember ? 'blue' : 'gray'}>{isMember ? 'Member' : 'Assistant'}</Chip>
                  {!isMember && (
                    <div className="mt-1 text-xs text-[var(--ink-3)]">
                      {u.linkedMainAccounts.length > 0
                        ? `for ${u.linkedMainAccounts.map(a => a.displayName).join(', ')}`
                        : 'not linked'}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {isMember ? (
                    <select
                      aria-label={`Plan for ${u.displayName}`}
                      value={u.plan}
                      disabled={saving}
                      onChange={e => void patchUser(u, { plan: e.target.value as Plan })}
                      className="rounded-lg border border-[var(--rule)] bg-white px-2 py-1.5 text-sm font-semibold text-[var(--ink)] disabled:opacity-50"
                    >
                      <option value="free">{PLAN_INFO.free.label}</option>
                      <option value="plus">{PLAN_INFO.plus.label}</option>
                    </select>
                  ) : (
                    <span className="text-xs text-[var(--ink-3)]">Inherited</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {isMember ? (
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={u.features.includes('portfolio')}
                        disabled={saving}
                        onChange={() => togglePortfolio(u)}
                        className="h-4 w-4 accent-[var(--blue-700)]"
                      />
                      <span className="text-xs text-[var(--ink-2)]">{u.features.includes('portfolio') ? 'On' : 'Off'}</span>
                    </label>
                  ) : (
                    <span className="text-xs text-[var(--ink-3)]">Not available</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {isMember && (u.features.includes('portfolio') || u.portfolio.alpaca !== null || u.portfolio.lastRun)
                    ? <PortfolioDetails p={u.portfolio} />
                    : <span className="text-xs text-[var(--ink-3)]">—</span>}
                </td>
                <td className="px-3 py-3">
                  {isMember ? (
                    <>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={u.features.includes('health')}
                          disabled={saving}
                          onChange={() => toggleHealth(u)}
                          className="h-4 w-4 accent-[var(--blue-700)]"
                        />
                        <span className="text-xs text-[var(--ink-2)]">{u.features.includes('health') ? 'Health enabled' : 'Off'}</span>
                      </label>
                      <div className="mt-1 text-xs text-[var(--ink-3)]">Last log: {u.health.lastLogDate ? fmtDate(u.health.lastLogDate) : '—'}</div>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--ink-3)]">Not available</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--ink-2)]">{fmtDate(u.createdAt)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
