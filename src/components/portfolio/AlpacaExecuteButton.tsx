'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import AlpacaOrderPreview from './AlpacaOrderPreview'

interface OrderPreviewItem {
  ticker: string
  action: 'buy' | 'sell'
  qty: number
  ask_price: number
  estimated_value: number
  skipped: boolean
  skip_reason: string | null
}

interface Props {
  recommendationId: string
  hasCredentials: boolean
  isPaper: boolean
  isLatest: boolean
  alreadyExecuted: boolean
  executedAt: string | null
}

type Mode = 'idle' | 'loading-preview' | 'preview-ready' | 'submitting' | 'done'

const PAPER_BADGE_STYLE: React.CSSProperties = {
  background: '#dbeafe',
  color: '#1d4ed8',
  padding: '2px 8px',
  borderRadius: 4,
  fontWeight: 700,
  fontSize: 11,
  display: 'inline-block',
  fontFamily: 'var(--sans)',
  marginLeft: 8,
}

export default function AlpacaExecuteButton({
  recommendationId,
  hasCredentials,
  isPaper,
  isLatest,
  alreadyExecuted,
  executedAt,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('idle')
  const [preview, setPreview] = useState<OrderPreviewItem[] | null>(null)
  const [isMarketOpen, setIsMarketOpen] = useState(true)

  if (!isLatest) return null

  const formattedExecutedAt = executedAt
    ? new Date(executedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  if (alreadyExecuted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          disabled
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'var(--rule)',
            color: 'var(--ink-4)',
            cursor: 'not-allowed',
            fontFamily: 'var(--sans)',
          }}
        >
          Executed on {formattedExecutedAt}
        </button>
        {isPaper && <span style={PAPER_BADGE_STYLE}>PAPER</span>}
      </div>
    )
  }

  if (!hasCredentials) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          disabled
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'var(--rule)',
            color: 'var(--ink-4)',
            cursor: 'not-allowed',
            fontFamily: 'var(--sans)',
          }}
        >
          Execute trades
        </button>
        <a
          href="/portfolio/settings"
          style={{
            fontSize: 13,
            color: 'var(--blue-700)',
            fontFamily: 'var(--sans)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Connect Alpaca in Settings →
        </a>
      </div>
    )
  }

  async function handleOpenPreview() {
    setMode('loading-preview')
    try {
      const res = await fetch('/api/portfolio/alpaca/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: recommendationId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
        toast(err.error ?? 'Failed to load preview', 'error')
        setMode('idle')
        return
      }
      const data = await res.json() as { preview: OrderPreviewItem[]; is_market_open: boolean }
      setPreview(data.preview)
      setIsMarketOpen(data.is_market_open)
      setMode('preview-ready')
    } catch {
      toast('Failed to load preview', 'error')
      setMode('idle')
    }
  }

  async function handleConfirmExecute() {
    setMode('submitting')
    try {
      const res = await fetch('/api/portfolio/alpaca/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: recommendationId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
        toast(err.error ?? 'Failed to execute trades', 'error')
        setMode('preview-ready')
        return
      }
      setMode('done')
      router.refresh()
    } catch {
      toast('Failed to execute trades', 'error')
      setMode('preview-ready')
    }
  }

  function handleCloseModal() {
    setMode('idle')
    setPreview(null)
  }

  const allSkipped = (preview ?? []).length > 0 && (preview ?? []).every(item => item.skipped)
  const hasActionable = (preview ?? []).some(item => !item.skipped)
  const isModalOpen = mode === 'preview-ready' || mode === 'submitting'

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={handleOpenPreview}
          disabled={mode === 'loading-preview'}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: mode === 'loading-preview' ? 'var(--rule)' : 'var(--blue-700)',
            color: mode === 'loading-preview' ? 'var(--ink-4)' : 'white',
            cursor: mode === 'loading-preview' ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
          }}
        >
          {mode === 'loading-preview'
            ? 'Loading preview…'
            : `Execute trades${isPaper ? ' (PAPER)' : ''}`}
        </button>
        {isPaper && mode !== 'loading-preview' && <span style={PAPER_BADGE_STYLE}>PAPER</span>}
      </div>

      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) handleCloseModal()
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 'var(--r-xl)',
              padding: 32,
              maxWidth: 700,
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2
                  style={{
                    fontFamily: 'var(--display)',
                    fontWeight: 700,
                    fontSize: 20,
                    color: 'var(--ink)',
                    margin: 0,
                  }}
                >
                  Execute Trades
                </h2>
                {isPaper && <span style={PAPER_BADGE_STYLE}>PAPER</span>}
              </div>
              <button
                onClick={handleCloseModal}
                disabled={mode === 'submitting'}
                aria-label="Close modal"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: mode === 'submitting' ? 'not-allowed' : 'pointer',
                  color: 'var(--ink-3)',
                  padding: '4px 8px',
                  lineHeight: 1,
                  fontFamily: 'var(--sans)',
                }}
              >
                ×
              </button>
            </div>

            {/* Market hours warning */}
            {!isMarketOpen && (
              <div
                style={{
                  background: '#fef9c3',
                  border: '1px solid #ca8a04',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: '#92400e',
                  fontSize: 13,
                  marginBottom: 16,
                  fontFamily: 'var(--sans)',
                }}
              >
                Markets are currently closed. Orders will queue for next market open.
              </div>
            )}

            {/* Order preview table */}
            <AlpacaOrderPreview preview={preview ?? []} />

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                marginTop: 24,
                paddingTop: 16,
                borderTop: '1px solid var(--rule)',
              }}
            >
              <button
                onClick={handleCloseModal}
                disabled={mode === 'submitting'}
                style={{
                  padding: '10px 20px',
                  borderRadius: 'var(--r)',
                  fontSize: 14,
                  fontWeight: 700,
                  border: '1.5px solid var(--rule)',
                  background: 'white',
                  color: 'var(--ink-2)',
                  cursor: mode === 'submitting' ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--sans)',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExecute}
                disabled={mode === 'submitting' || allSkipped || !hasActionable}
                style={{
                  padding: '10px 20px',
                  borderRadius: 'var(--r)',
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  background:
                    mode === 'submitting' || allSkipped || !hasActionable
                      ? 'var(--rule)'
                      : 'var(--blue-700)',
                  color:
                    mode === 'submitting' || allSkipped || !hasActionable
                      ? 'var(--ink-4)'
                      : 'white',
                  cursor:
                    mode === 'submitting' || allSkipped || !hasActionable
                      ? 'not-allowed'
                      : 'pointer',
                  fontFamily: 'var(--sans)',
                  transition: 'background .12s',
                }}
              >
                {mode === 'submitting' ? 'Executing…' : 'Confirm & Execute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
