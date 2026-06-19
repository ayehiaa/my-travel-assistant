'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'

interface Props {
  initialConnected: boolean
  initialIsPaper: boolean
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
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--blue-700)'
    e.target.style.boxShadow = '0 0 0 3px var(--blue-100)'
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
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

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 'var(--r-xl)',
  border: '1px solid var(--rule)',
  padding: '28px',
  maxWidth: 480,
}

export default function AlpacaCredentialsForm({ initialConnected, initialIsPaper }: Props) {
  const toast = useToast()
  const [connected, setConnected] = useState(initialConnected)
  const [isPaper, setIsPaper] = useState(initialIsPaper)
  const [keyId, setKeyId] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [saving, setSaving] = useState(false)

  const canConnect = keyId.trim() !== '' && secretKey.trim() !== '' && !saving

  async function handleConnect() {
    setSaving(true)
    try {
      const res = await fetch('/api/portfolio/alpaca/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_id: keyId, secret_key: secretKey, is_paper: isPaper }),
      })
      if (!res.ok) {
        toast('Failed to connect Alpaca account', 'error')
        return
      }
      const data = await res.json() as { connected: boolean; is_paper: boolean }
      setConnected(true)
      setIsPaper(data.is_paper)
      setKeyId('')
      setSecretKey('')
      toast('Alpaca account connected', 'success')
    } catch {
      toast('Failed to connect Alpaca account', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    setSaving(true)
    try {
      const res = await fetch('/api/portfolio/alpaca/credentials', { method: 'DELETE' })
      if (!res.ok) {
        toast('Failed to disconnect Alpaca account', 'error')
        return
      }
      setConnected(false)
      toast('Alpaca account disconnected', 'success')
    } catch {
      toast('Failed to disconnect Alpaca account', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (connected) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <span
            style={{
              background: '#dcfce7',
              color: '#16a34a',
              padding: '4px 12px',
              borderRadius: 20,
              fontWeight: 700,
              fontSize: 13,
              fontFamily: 'var(--sans)',
              display: 'inline-block',
            }}
          >
            Connected ({isPaper ? 'Paper' : 'Live'})
          </span>
        </div>
        <p style={{ color: 'var(--ink-3)', fontSize: 14, fontFamily: 'var(--sans)', marginBottom: 20 }}>
          Your Alpaca {isPaper ? 'paper trading' : 'live trading'} account is connected. Raw credentials are never re-displayed.
        </p>
        <button
          onClick={handleDisconnect}
          disabled={saving}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: saving ? 'var(--rule)' : '#fee2e2',
            color: saving ? 'var(--ink-4)' : '#dc2626',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
          }}
        >
          {saving ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle} htmlFor="alpaca-key-id">API Key ID</label>
          <input
            id="alpaca-key-id"
            type="password"
            autoComplete="new-password"
            value={keyId}
            placeholder="PKXXXXXXXXXXXXXXXX"
            style={inputStyle}
            onChange={e => setKeyId(e.target.value)}
            {...focusHandlers}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle} htmlFor="alpaca-secret-key">API Secret Key</label>
          <input
            id="alpaca-secret-key"
            type="password"
            autoComplete="new-password"
            value={secretKey}
            placeholder="••••••••••••••••••••••••••••••••"
            style={inputStyle}
            onChange={e => setSecretKey(e.target.value)}
            {...focusHandlers}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'var(--sans)',
            color: 'var(--ink)',
            fontWeight: 500,
          }}
        >
          <input
            type="checkbox"
            checked={isPaper}
            onChange={e => setIsPaper(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--blue-700)' }}
          />
          Paper Trading (recommended)
        </label>

        <button
          onClick={handleConnect}
          disabled={!canConnect}
          style={{
            padding: '12px 24px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: canConnect ? 'var(--blue-700)' : 'var(--rule)',
            color: canConnect ? 'white' : 'var(--ink-4)',
            cursor: canConnect ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
            alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  )
}
