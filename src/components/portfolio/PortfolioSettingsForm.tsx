'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { PortfolioSettings, RiskProfile, TargetHorizon } from '@/types/database'

interface Props {
  initialSettings: PortfolioSettings
}

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--rule)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 600,
  background: 'white',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--sans)',
  outline: 'none',
  color: 'var(--ink)',
}

const focusHandlers = {
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--blue-700)'
    e.target.style.boxShadow = '0 0 0 3px var(--blue-100)'
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.target.style.borderColor = 'var(--rule)'
    e.target.style.boxShadow = 'none'
  },
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
}

export default function PortfolioSettingsForm({ initialSettings }: Props) {
  const toast = useToast()

  const [cashStr, setCashStr] = useState(String(initialSettings.cash_usd))
  const [targetReturnStr, setTargetReturnStr] = useState(
    String(initialSettings.target_return_pct)
  )
  const [targetHorizon, setTargetHorizon] = useState<TargetHorizon>(
    initialSettings.target_horizon ?? 'annual'
  )
  const [riskProfile, setRiskProfile] = useState<RiskProfile>(initialSettings.risk_profile)
  const [runIntervalDays, setRunIntervalDays] = useState<7 | 14 | 30>(
    initialSettings.run_interval_days
  )
  const [saving, setSaving] = useState(false)

  const parsedCash = parseFloat(cashStr)
  const parsedReturn = parseFloat(targetReturnStr)
  const isValid = !isNaN(parsedCash) && parsedCash >= 0 && !isNaN(parsedReturn) && parsedReturn > 0

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/portfolio/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cash_usd: parsedCash,
          target_return_pct: parsedReturn,
          target_horizon: targetHorizon,
          risk_profile: riskProfile,
          run_interval_days: runIntervalDays,
        }),
      })

      if (!res.ok) {
        toast('Failed to save settings', 'error')
        return
      }

      toast('Settings saved', 'success')
    } catch {
      toast('Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--rule)',
        padding: '28px',
        maxWidth: 480,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Cash (USD) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Cash (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cashStr}
            placeholder="0.00"
            style={inputStyle}
            onChange={e => setCashStr(e.target.value)}
            {...focusHandlers}
          />
        </div>

        {/* Target Return */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Target Return (%)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              min="0.01"
              step="0.1"
              value={targetReturnStr}
              placeholder="10"
              style={{ ...inputStyle, flex: 1 }}
              onChange={e => setTargetReturnStr(e.target.value)}
              {...focusHandlers}
            />
            <select
              value={targetHorizon}
              style={{ ...inputStyle, width: 'auto', cursor: 'pointer', flexShrink: 0 }}
              onChange={e => setTargetHorizon(e.target.value as TargetHorizon)}
              {...focusHandlers}
            >
              <option value="annual">per year</option>
              <option value="monthly">per month</option>
            </select>
          </div>
        </div>

        {/* Risk Profile */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Risk Profile</label>
          <select
            value={riskProfile}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onChange={e => setRiskProfile(e.target.value as RiskProfile)}
            {...focusHandlers}
          >
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>

        {/* Analysis Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Analysis Schedule</label>
          <select
            value={runIntervalDays}
            style={{ ...inputStyle, cursor: 'pointer' }}
            onChange={e => setRunIntervalDays(Number(e.target.value) as 7 | 14 | 30)}
            {...focusHandlers}
          >
            <option value={7}>Weekly</option>
            <option value={14}>Fortnightly</option>
            <option value={30}>Monthly</option>
          </select>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          style={{
            padding: '12px 24px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: isValid && !saving ? 'var(--blue-700)' : 'var(--rule)',
            color: isValid && !saving ? 'white' : 'var(--ink-4)',
            cursor: isValid && !saving ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
            alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
