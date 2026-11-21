'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { isValidAnthropicKeyFormat } from '@/lib/aiKeyResolver'
import { SETTINGS_CARD, SETTINGS_CARD_TITLE } from './settingsCard'

interface Props {
  migrationApplied: boolean
  initialConnected: boolean
  initialProvider: string | null
  initialLast4: string | null
  initialCreatedAt: string | null
  /** No own key, but runs use the app key (owner email allow-list). */
  usingOwnerFallback: boolean
}

const CONSOLE_URL = 'https://console.anthropic.com'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
}

function ConsoleLink({ children }: { children: React.ReactNode }) {
  return (
    <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--blue-700)] underline">
      {children}
    </a>
  )
}

function KeyGuide() {
  return (
    <div className="space-y-3 text-sm text-[var(--ink-2)]">
      <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
        <strong>Why do I need this?</strong> Each analysis runs Claude on your behalf, and you pay Anthropic directly
        for it. A Claude.ai <strong>Pro or Max chat subscription cannot be used by apps</strong> — you need an
        Anthropic <strong>API key</strong>, which is billed separately (pay-as-you-go credits).
      </p>
      <ol className="list-decimal space-y-1.5 pl-5">
        <li>Sign up or log in at <ConsoleLink>console.anthropic.com</ConsoleLink>.</li>
        <li>Go to <strong>Billing</strong> and add credits (for example $5).</li>
        <li>Go to <strong>Settings → API keys</strong> and click <strong>Create key</strong>.</li>
        <li>
          Copy the key — it is shown only once and starts with{' '}
          <code className="rounded bg-gray-100 px-1 font-mono text-xs">sk-ant-</code>.
        </li>
        <li>Paste it below and click Save. We check it with Anthropic before saving.</li>
      </ol>
      <p>
        <strong>Estimated cost:</strong> about <strong>$0.15–0.30 per analysis run</strong>. We recommend setting a
        monthly spend limit in the Anthropic console (Settings → Limits).
      </p>
      <p className="text-xs text-[var(--ink-3)]">
        Your key is encrypted before it is stored and is never shown again (only its last 4 characters). Never share it
        with anyone. You can revoke it at any time in the Anthropic console.
      </p>
    </div>
  )
}

/** "Claude API key" card in Portfolio → Settings (specs/026 — bring your own Anthropic API key). */
export default function AiKeyCard(props: Props) {
  const toast = useToast()
  const router = useRouter()
  const [connected, setConnected] = useState(props.initialConnected)
  const [provider, setProvider] = useState(props.initialProvider)
  const [last4, setLast4] = useState(props.initialLast4)
  const [createdAt, setCreatedAt] = useState(props.initialCreatedAt)
  const [replacing, setReplacing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatOk = isValidAnthropicKeyFormat(apiKey)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formatOk) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/ai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; provider?: string; last4?: string; created_at?: string }
      if (!res.ok) {
        setError(data.error ?? 'Could not save the key')
        toast(data.error ?? 'Could not save the key', 'error')
        return
      }
      setConnected(true)
      setProvider(data.provider ?? 'anthropic')
      setLast4(data.last4 ?? null)
      setCreatedAt(data.created_at ?? new Date().toISOString())
      setApiKey('')
      setReplacing(false)
      toast('Anthropic API key saved', 'success')
      router.refresh()
    } catch {
      toast('Could not save the key', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!window.confirm('Remove your Anthropic API key? Analysis runs will stop until you add a key again.')) return
    setSaving(true)
    try {
      const res = await fetch('/api/portfolio/ai-key', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast(data.error ?? 'Could not remove the key', 'error')
        return
      }
      setConnected(false)
      setLast4(null)
      setCreatedAt(null)
      toast('Anthropic API key removed', 'success')
      router.refresh()
    } catch {
      toast('Could not remove the key', 'error')
    } finally {
      setSaving(false)
    }
  }

  const form = (
    <form onSubmit={handleSave} className="mt-4 flex flex-col gap-2">
      <label htmlFor="anthropic-api-key" className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-3)]">
        Anthropic API key
      </label>
      <input
        id="anthropic-api-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={apiKey}
        onChange={e => { setApiKey(e.target.value); setError(null) }}
        placeholder="sk-ant-…"
        className="w-full rounded-lg border border-[var(--rule)] bg-white px-3 py-2 font-mono text-sm text-[var(--ink)] outline-none focus:border-[var(--blue-700)]"
      />
      {apiKey !== '' && !formatOk && (
        <p className="text-xs text-red-700">Anthropic API keys start with “sk-ant-” and are at least 20 characters.</p>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!formatOk || saving}
          className="rounded-lg bg-[var(--blue-700)] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          {saving ? 'Checking…' : 'Save key'}
        </button>
        {replacing && (
          <button
            type="button"
            onClick={() => { setReplacing(false); setApiKey(''); setError(null) }}
            className="rounded-lg border border-[var(--rule)] px-4 py-2 text-sm font-semibold text-[var(--ink-2)]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )

  return (
    <section className={SETTINGS_CARD} aria-labelledby="ai-key-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="ai-key-heading" className={SETTINGS_CARD_TITLE}>Claude API key</h3>
        {connected ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Connected</span>
        ) : props.usingOwnerFallback ? (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">Using app key</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">Not set</span>
        )}
      </div>

      {!props.migrationApplied ? (
        <div className="mt-3 space-y-2 text-sm">
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            <strong>Database update needed.</strong> Personal API keys can be saved once the owner applies
            supabase/apply_friend_onboarding_2026-11-21.sql.
          </p>
          {props.usingOwnerFallback && <p className="text-[var(--ink-2)]">Your runs use the app&apos;s key (owner account).</p>}
        </div>
      ) : connected ? (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Provider</dt>
              <dd className="font-semibold capitalize text-[var(--ink)]">{provider ?? 'anthropic'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Key</dt>
              <dd className="font-mono font-semibold text-[var(--ink)]">••••{last4}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ink-3)]">Added</dt>
              <dd className="font-semibold text-[var(--ink)]">{fmtDate(createdAt)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-[var(--ink-3)]">
            Your analysis runs are billed to this key (≈ $0.15–0.30 per run). Manage spend limits at{' '}
            <ConsoleLink>console.anthropic.com</ConsoleLink>.
          </p>
          {replacing ? form : (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setReplacing(true)}
                disabled={saving}
                className="rounded-lg border border-[var(--rule)] px-4 py-2 text-sm font-semibold text-[var(--ink-2)]"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={saving}
                className="rounded-lg bg-red-50 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
              >
                {saving ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-3">
          {props.usingOwnerFallback && (
            <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Your runs currently use the app&apos;s key (owner account). Add a personal key to use your own instead.
            </p>
          )}
          <KeyGuide />
          {form}
        </div>
      )}
    </section>
  )
}
