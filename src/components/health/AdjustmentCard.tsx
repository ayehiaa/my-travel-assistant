'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { sendJson, errorOf } from './api'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD, CARD_TITLE } from './ui'

export interface AdjustmentCardProps {
  periodEnd: string
  kcalChange: number
  reasoning: string
  caveat: string | null
  currentKcal: number
  newKcal: number
  newCarbsG: number
  currentCarbsG: number
}

/** Fortnightly adjustment proposal (specs/029 §6.3): accept → targets updated; decline → recorded. */
export default function AdjustmentCard(p: AdjustmentCardProps) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function decide(decision: 'accept' | 'decline') {
    setBusy(true)
    const r = await sendJson('/api/health/adjustments', { periodEnd: p.periodEnd, decision })
    setBusy(false)
    if (!r.ok) { toast(errorOf(r, 'Could not save the decision'), 'error'); return }
    toast(decision === 'accept' ? (p.kcalChange !== 0 ? 'Targets updated' : 'Noted') : 'Declined — targets unchanged', 'success')
    router.refresh()
  }
  const change = p.kcalChange !== 0
  return (
    <section className={`${CARD} border-[var(--blue-700)]`} aria-labelledby="adj-h">
      <h2 id="adj-h" className={CARD_TITLE}>Fortnightly check</h2>
      <p className="text-sm text-[var(--ink)]">{p.reasoning}</p>
      {change && (
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          Energy {p.currentKcal} → <strong className="text-[var(--ink)]">{p.newKcal} kcal</strong> · carbs {p.currentCarbsG} → {p.newCarbsG} g · protein unchanged.
        </p>
      )}
      {p.caveat && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">{p.caveat}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {change ? (
          <>
            <button type="button" className={BUTTON_SECONDARY} disabled={busy} onClick={() => decide('decline')}>Keep my targets</button>
            <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={() => decide('accept')}>Accept {p.kcalChange > 0 ? '+' : '−'}{Math.abs(p.kcalChange)} kcal</button>
          </>
        ) : (
          <button type="button" className={BUTTON_PRIMARY} disabled={busy} onClick={() => decide('accept')}>Got it</button>
        )}
      </div>
    </section>
  )
}
