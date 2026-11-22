'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from './ui'

interface Props {
  checkId: string
  sessionName: string
  sessionDate: string
  duringPain: number | null
  threshold: number
  redFlags: string[]
}

/** Next-morning joint check (specs/029 US6): pain 0–10, swelling, red flags. Shown on Today after a pain-check session. */
export default function NextMorningCheckCard({ checkId, sessionName, sessionDate, duringPain, threshold, redFlags }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [pain, setPain] = useState<number | null>(null)
  const [swelling, setSwelling] = useState(false)
  const [flags, setFlags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  async function save() {
    if (pain === null) { toast('Choose a pain score (0–10)', 'error'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/health/joint-checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next_morning', checkId, nextMorningPain: pain, swelling, redFlags: flags }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Could not save', 'error'); return }
      toast(data.redFlag ? 'Saved — leg work is paused until your physiotherapist clears you' : 'Joint check saved', data.redFlag ? 'info' : 'success')
      router.refresh()
    } catch {
      toast('Network error — try again', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`${CARD} border-[var(--blue-700)]`} aria-labelledby="jc-h">
      <h2 id="jc-h" className={CARD_TITLE}>Joint check — morning after {sessionName}</h2>
      <p className="mb-2 text-sm text-[var(--ink-2)]">
        How does the joint feel this morning? ({sessionDate}{duringPain !== null && <>; {duringPain}/10 during the session</>}). Up to {threshold} and settled is OK.
      </p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Pain this morning, 0 to 10">
        {Array.from({ length: 11 }, (_, v) => (
          <button key={v} type="button" aria-pressed={pain === v} onClick={() => setPain(v)}
            className={`h-10 w-10 rounded-full text-sm font-bold ${pain === v ? (v > threshold ? 'bg-red-700 text-white' : 'bg-[var(--blue-700)] text-white') : 'border border-[var(--rule)] text-[var(--ink-2)]'}`}>
            {v}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ink)]">
        <input type="checkbox" className="h-4 w-4" checked={swelling} onChange={e => setSwelling(e.target.checked)} />
        Swollen or sore compared with yesterday
      </label>
      {redFlags.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-xs font-bold uppercase tracking-wide text-red-800">Red flags — tick any you noticed</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {redFlags.map(f => (
              <label key={f} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                <input type="checkbox" className="h-4 w-4" checked={flags.includes(f)}
                  onChange={e => setFlags(prev => (e.target.checked ? [...prev, f] : prev.filter(x => x !== f)))} />
                {f}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-3 flex justify-end">
        <button type="button" className={BUTTON_PRIMARY} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save joint check'}</button>
      </div>
    </section>
  )
}
