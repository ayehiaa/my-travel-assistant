'use client'

import { useState, useRef } from 'react'
import { useToast } from '@/context/ToastContext'
import { PortfolioHolding } from '@/types/database'
import TickerAutocomplete from './TickerAutocomplete'

interface Props {
  holdingToEdit: PortfolioHolding | null
  onClose: () => void
  onSaved: (holding: PortfolioHolding) => void
}

interface TickerResult {
  ticker: string
  name: string
  primary_exchange: string
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

function HoldingFormBody({ holdingToEdit, onClose, onSaved }: Props) {
  const toast = useToast()
  const isEditMode = holdingToEdit !== null

  const [ticker, setTicker] = useState(holdingToEdit?.ticker ?? '')
  const [companyName, setCompanyName] = useState(holdingToEdit?.company_name ?? '')
  const [valueStr, setValueStr] = useState(
    holdingToEdit ? String(holdingToEdit.total_value_usd) : ''
  )
  const [saving, setSaving] = useState(false)

  const valueInputRef = useRef<HTMLInputElement>(null)

  const parsedValue = parseFloat(valueStr)
  const isValid =
    ticker.trim() !== '' &&
    companyName.trim() !== '' &&
    !isNaN(parsedValue) &&
    parsedValue > 0

  function handleTickerSelect(result: TickerResult) {
    setTicker(result.ticker)
    setCompanyName(result.name)
    setTimeout(() => valueInputRef.current?.focus(), 0)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const url = isEditMode
        ? `/api/portfolio/holdings/${holdingToEdit.id}`
        : '/api/portfolio/holdings'
      const method = isEditMode ? 'PUT' : 'POST'
      const body = isEditMode
        ? { total_value_usd: parsedValue }
        : { ticker: ticker.trim(), company_name: companyName.trim(), total_value_usd: parsedValue }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'Ticker already exists in portfolio') {
          toast('This ticker is already in your portfolio', 'error')
        } else {
          toast(data.error ?? 'Failed to save holding', 'error')
        }
        setSaving(false)
        return
      }

      onSaved(data.holding)
      onClose()
    } catch {
      toast('Failed to save holding', 'error')
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,31,77,.55)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        padding: 20,
        animation: 'modalIn .18s ease',
      }}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 'var(--r-xl)',
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          animation: 'modalRise .22s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            position: 'relative',
            padding: '24px 28px 18px',
            background: 'linear-gradient(135deg, var(--lavender-soft) 0%, var(--paper) 100%)',
            borderBottom: '1px solid var(--rule)',
            flexShrink: 0,
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 700,
              fontSize: 24,
              margin: '0 0 4px',
              letterSpacing: '-0.01em',
            }}
          >
            {isEditMode ? 'Edit holding' : 'Add holding'}
          </h3>
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13 }}>
            {isEditMode
              ? 'Update the value for this position.'
              : 'Search for a ticker and enter your current position value.'}
          </p>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'white',
              color: 'var(--ink-2)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 22,
              fontWeight: 600,
              border: '1px solid var(--rule)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '22px 28px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            overflowY: 'auto',
          }}
        >
          {/* Ticker field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Ticker</label>
            {isEditMode ? (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--paper-2, #f8f8fb)',
                  borderRadius: 10,
                  border: '1.5px solid var(--rule)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--ink)',
                  }}
                >
                  {ticker}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--ink-3)',
                    marginLeft: 8,
                  }}
                >
                  {companyName}
                </span>
              </div>
            ) : ticker ? (
              <div>
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--paper-2, #f8f8fb)',
                    borderRadius: 10,
                    border: '1.5px solid var(--rule)',
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      fontSize: 14,
                      color: 'var(--ink)',
                    }}
                  >
                    {ticker}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-3)',
                      marginLeft: 8,
                    }}
                  >
                    {companyName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTicker('')
                      setCompanyName('')
                    }}
                    style={{
                      float: 'right',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--ink-3)',
                      padding: 0,
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <TickerAutocomplete onSelect={handleTickerSelect} />
            )}
          </div>

          {/* Value (USD) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Value (USD)</label>
            <input
              ref={valueInputRef}
              type="number"
              min="0.01"
              step="0.01"
              value={valueStr}
              placeholder="0.00"
              style={inputStyle}
              onChange={e => setValueStr(e.target.value)}
              {...focusHandlers}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '16px 28px',
            background: 'var(--paper-2)',
            borderTop: '1px solid var(--rule)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              border: '1.5px solid var(--rule)',
              borderRadius: 'var(--r)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink-2)',
              background: 'white',
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r)',
              fontSize: 14,
              fontWeight: 700,
              border: 'none',
              background: isValid && !saving ? 'var(--blue-700)' : 'var(--rule)',
              color: isValid && !saving ? 'white' : 'var(--ink-4)',
              cursor: isValid && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--sans)',
              transition: 'background .12s',
            }}
          >
            {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Add holding'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HoldingForm(props: Props) {
  return <HoldingFormBody key={props.holdingToEdit?.id ?? 'new'} {...props} />
}
