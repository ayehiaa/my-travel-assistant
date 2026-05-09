'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'

type Props = {
  initialDate: string | null
  annualDaysAbroad: number | null
}

export default function ReferenceDateSettings({ initialDate, annualDaysAbroad }: Props) {
  const [value, setValue] = useState(initialDate ?? '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const isDirty = value !== (initialDate ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/reference-date', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceDate: value || null }),
      })
      if (!res.ok) throw new Error()
      toast('Reference date saved', 'success')
    } catch {
      toast('Failed to save reference date', 'error')
    } finally {
      setSaving(false)
    }
  }

  const windowEnd = value
    ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  const used = annualDaysAbroad ?? 0
  const fillPct = Math.min(100, (used / 90) * 100)

  return (
    <div className="sj-ref-body" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'stretch' }}>
      {/* Left: date input + save */}
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }}>Reference date</div>
        <input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          style={{
            width: '100%', border: '1.5px solid var(--rule)', borderRadius: 10,
            padding: '12px 14px', fontSize: 16, fontWeight: 600,
            background: 'white', fontFamily: 'var(--mono)', color: 'var(--ink)',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--blue-700)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--rule)' }}
        />
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.5 }}>
          We count days outside the UK for the 12 months ending on this date.
          Adjust to match your visa, residency rule, or tax-year window.
        </div>
        {isDirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginTop: 12, background: 'var(--yellow)', color: 'var(--blue-900)',
              border: 'none', borderRadius: 999, padding: '9px 20px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--sans)', opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save date'}
          </button>
        )}
      </div>

      {/* Right: navy gradient readout */}
      <div style={{
        background: 'linear-gradient(135deg, var(--blue-700), var(--blue-900))',
        color: 'white', borderRadius: 'var(--r)', padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>Window ends</div>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', marginBottom: 8 }}>
          {windowEnd}
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.18)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${fillPct}%`,
            background: 'linear-gradient(90deg, var(--mint) 0%, var(--yellow) 70%, var(--coral) 100%)',
            transition: 'width .3s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
          <span>
            <strong style={{ color: 'var(--yellow)', fontFamily: 'var(--display)', fontSize: 14 }}>{used}</strong>
            /90 days used
          </span>
          <span style={{ opacity: 0.7 }}>{90 - used} remaining</span>
        </div>
      </div>
    </div>
  )
}
