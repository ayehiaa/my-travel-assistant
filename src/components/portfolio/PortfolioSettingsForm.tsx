'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { PortfolioSettings, RiskProfile, TargetHorizon } from '@/types/database'
import { SETTINGS_CARD, SETTINGS_CARD_TITLE } from './settingsCard'

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

  const [targetReturnStr, setTargetReturnStr] = useState(
    String(initialSettings.target_return_pct)
  )
  const [targetHorizon, setTargetHorizon] = useState<TargetHorizon>(
    initialSettings.target_horizon ?? 'annual'
  )
  const [riskProfile, setRiskProfile] = useState<RiskProfile>(initialSettings.risk_profile)
  const [saving, setSaving] = useState(false)

  const parsedReturn = parseFloat(targetReturnStr)
  const isValid = !isNaN(parsedReturn) && parsedReturn > 0

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/portfolio/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_return_pct: parsedReturn,
          target_horizon: targetHorizon,
          risk_profile: riskProfile,
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
    <section className={SETTINGS_CARD} aria-labelledby="targets-heading">
      <h3 id="targets-heading" className={`${SETTINGS_CARD_TITLE} mb-4`}>Target &amp; risk</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

        {/* Analysis schedule lives in the Autopilot card (AutopilotCard) */}

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
    </section>
  )
}
