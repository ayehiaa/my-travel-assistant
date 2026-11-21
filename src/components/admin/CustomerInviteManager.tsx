'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/context/ToastContext'
import Skeleton from '@/components/ui/Skeleton'
import { FEATURE_INFO, PLAN_INFO, type FeatureKey, type Plan } from '@/lib/access'
import { invitationAccessLabel } from '@/lib/invitationRoles'
import type { CustomerInvitationStatus } from '@/types/database'

interface InvitationRow {
  id: string
  email: string
  invited_name: string
  status: CustomerInvitationStatus
  expires_at: string
  invited_at: string
  invited_by_name: string
  plan: Plan
  features: FeatureKey[]
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const STATUS_CHIP: Record<CustomerInvitationStatus, string> = {
  pending:  'bg-yellow-100 text-yellow-900',
  accepted: 'bg-green-100 text-green-800',
  expired:  'bg-red-100 text-red-800',
}

/** Admin-only customer invitations: invite form (name, email, plan, Portfolio add-on) + list with resend / revoke. */
export default function CustomerInviteManager() {
  const toast = useToast()
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [plan, setPlan] = useState<Plan>('free')
  const [portfolio, setPortfolio] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/customer-invitations')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((data: InvitationRow[]) => setInvitations(data))
      .catch(() => toast('Could not load invitations', 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/customer-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, invitedName: name, plan, features: portfolio ? ['portfolio'] : [] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Something went wrong', 'error'); return }
      setInvitations(prev => [data as InvitationRow, ...prev])
      setName(''); setEmail(''); setPlan('free'); setPortfolio(false)
      toast(`Invitation sent to ${email}`, 'success')
    } catch {
      toast('Network error — the invitation was not sent', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend(id: string) {
    setBusyId(id)
    try {
      const res = await fetch('/api/customer-invitations/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not resend', 'error'); return }
      setInvitations(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'pending', expires_at: data.expiresAt } : inv))
      toast('Invitation re-sent', 'success')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevoke(inv: InvitationRow) {
    if (!window.confirm(`Revoke the invitation for ${inv.email}? The link stops working immediately.`)) return
    setBusyId(inv.id)
    try {
      const res = await fetch(`/api/customer-invitations/${inv.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not revoke', 'error'); return }
      setInvitations(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'expired', expires_at: new Date().toISOString() } : i))
      toast('Invitation revoked', 'success')
    } finally {
      setBusyId(null)
    }
  }

  const pending = invitations.filter(i => i.status === 'pending')
  const others = invitations.filter(i => i.status !== 'pending')

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleInvite} className="grid gap-3 rounded-[var(--r)] border-2 border-dashed border-[var(--blue-500)] bg-[var(--blue-100)] p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">
          Name
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} required maxLength={100}
            placeholder="Customer's full name"
            className="rounded-lg border border-[var(--rule)] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ink)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">
          Email
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="customer@example.com"
            className="rounded-lg border border-[var(--rule)] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ink)]"
          />
        </label>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">Plan</legend>
          {(['free', 'plus'] as const).map(p => (
            <label key={p} className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink)]">
              <input type="radio" name="invite-plan" value={p} checked={plan === p} onChange={() => setPlan(p)} className="mt-1" />
              <span><strong>{PLAN_INFO[p].label}</strong> <span className="text-xs text-[var(--ink-2)]">— {PLAN_INFO[p].description}</span></span>
            </label>
          ))}
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">Add-ons</legend>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink)]">
            <input type="checkbox" checked={portfolio} onChange={e => setPortfolio(e.target.checked)} className="mt-1" />
            <span><strong>{FEATURE_INFO.portfolio.label}</strong> <span className="text-xs text-[var(--ink-2)]">— {FEATURE_INFO.portfolio.description}</span></span>
          </label>
        </fieldset>
        <div className="flex justify-end sm:col-span-2">
          <button
            type="submit" disabled={submitting || !name || !email}
            className="rounded-full bg-[var(--blue-700)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : invitations.length === 0 ? (
        <p className="rounded-[var(--r)] border-2 border-dashed border-[var(--rule)] p-6 text-center text-sm text-[var(--ink-3)]">
          No invitations sent yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">Invitations ({pending.length} pending)</h3>
          {[...pending, ...others].map(inv => (
            <div key={inv.id} className="flex flex-col gap-2 rounded-[var(--r)] border border-[var(--rule)] bg-[var(--paper-2)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-[var(--ink)]">{inv.invited_name}</div>
                <div className="truncate text-xs text-[var(--ink-3)]">{inv.email}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-2)]">
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                    {invitationAccessLabel({ plan: inv.plan, features: inv.features })}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 font-bold capitalize ${STATUS_CHIP[inv.status]}`}>{inv.status}</span>
                  <span>invited {fmtDate(inv.invited_at)} by {inv.invited_by_name}</span>
                  {inv.status === 'pending' && <span>· expires {fmtDate(inv.expires_at)}</span>}
                </div>
              </div>
              {inv.status !== 'accepted' && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => void handleResend(inv.id)} disabled={busyId === inv.id}
                    className="rounded-full border border-[var(--blue-500)] px-3 py-1 text-xs font-semibold text-[var(--blue-700)] disabled:opacity-40"
                  >
                    Resend
                  </button>
                  {inv.status === 'pending' && (
                    <button
                      onClick={() => void handleRevoke(inv)} disabled={busyId === inv.id}
                      className="rounded-full border border-[var(--coral)] px-3 py-1 text-xs font-semibold text-[var(--coral)] disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
