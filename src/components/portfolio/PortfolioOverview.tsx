'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { PortfolioHolding, PortfolioSettings } from '@/types/database'
import { computeHoldingSummaries, formatUsd } from '@/lib/portfolioCalculator'
import HoldingForm from './HoldingForm'

interface Props {
  initialHoldings: PortfolioHolding[]
  initialSettings: PortfolioSettings
  latestRecommendation?: { id: string; run_at: string; summary_text: string | null } | null
  lastSyncedAt: string | null
  syncError: boolean
  hasAlpaca: boolean
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

export default function PortfolioOverview({
  initialHoldings,
  initialSettings,
  latestRecommendation,
  lastSyncedAt,
  syncError,
  hasAlpaca,
}: Props) {
  const router = useRouter()
  const toast = useToast()

  const [holdings, setHoldings] = useState<PortfolioHolding[]>(initialHoldings)
  const [settings] = useState<PortfolioSettings>(initialSettings)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingHolding, setEditingHolding] = useState<PortfolioHolding | null>(null)

  const [isSyncing, setIsSyncing] = useState(false)
  const [localLastSynced, setLocalLastSynced] = useState<string | null>(lastSyncedAt)
  const [localSyncError, setLocalSyncError] = useState(syncError)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const { summaries, totals } = computeHoldingSummaries(holdings, settings.cash_usd)

  async function handleSync() {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/portfolio/alpaca/sync', { method: 'POST' })
      if (!res.ok) {
        toast('Could not sync with Alpaca', 'error')
        setLocalSyncError(true)
      } else {
        const body = await res.json() as { holdings: PortfolioHolding[]; last_synced_at: string }
        setHoldings(body.holdings)
        setLocalLastSynced(body.last_synced_at)
        setLocalSyncError(false)
        setBannerDismissed(false)
        router.refresh()
      }
    } catch {
      toast('Could not sync with Alpaca', 'error')
      setLocalSyncError(true)
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/portfolio/holdings/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast('Failed to delete holding', 'error')
        return
      }
      setHoldings(prev => prev.filter(h => h.id !== id))
      router.refresh()
    } catch {
      toast('Failed to delete holding', 'error')
    }
  }

  function handleSaved(saved: PortfolioHolding) {
    if (editingHolding) {
      setHoldings(prev => prev.map(h => (h.id === saved.id ? saved : h)))
    } else {
      setHoldings(prev => [saved, ...prev])
    }
    handleCloseModal()
    router.refresh()
  }

  function handleCloseModal() {
    setShowAddModal(false)
    setEditingHolding(null)
  }

  const showErrorBanner = localSyncError && hasAlpaca && !bannerDismissed

  return (
    <>
      {/* Amber error banner — F3 */}
      {showErrorBanner && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 text-amber-800 rounded flex items-center justify-between gap-3 px-4 py-3 mb-4 text-sm"
        >
          <span>Portfolio may be out of date — could not reach Alpaca.</span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="font-semibold text-amber-800 bg-transparent border-none cursor-pointer disabled:opacity-50"
            >
              {isSyncing ? 'Syncing…' : 'Retry sync'}
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
              className="text-amber-800 bg-transparent border-none cursor-pointer text-base leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Sync status line — F2 */}
      {hasAlpaca && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--ink-3)',
          }}
        >
          <span>
            {localLastSynced
              ? `Synced ${formatRelativeTime(localLastSynced)}`
              : 'Never synced'}
          </span>
          <span style={{ color: 'var(--rule)' }}>·</span>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: isSyncing ? 'default' : 'pointer',
              color: 'var(--ink-3)',
              fontSize: 13,
              fontFamily: 'var(--sans)',
              textDecoration: isSyncing ? 'none' : 'underline',
              opacity: isSyncing ? 0.6 : 1,
            }}
          >
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
        <Link
          href="/portfolio/settings"
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 600,
            border: '1.5px solid var(--rule)',
            background: 'white',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
            textDecoration: 'none',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Settings
        </Link>
        <button
          onClick={() => {
            setEditingHolding(null)
            setShowAddModal(true)
          }}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--r)',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'var(--blue-700)',
            color: 'white',
            cursor: 'pointer',
            fontFamily: 'var(--sans)',
            transition: 'background .12s',
          }}
        >
          + Add holding
        </button>
      </div>

      {/* Empty state */}
      {holdings.length === 0 ? (
        <div
          style={{
            border: '2px dashed var(--rule)',
            borderRadius: 'var(--r-lg)',
            padding: '48px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-3)', fontWeight: 500 }}>
            No holdings yet — add your first position.
          </p>
        </div>
      ) : (
        /* Holdings table — F1: Shares column added */
        <div style={{ overflowX: 'auto', marginBottom: 24 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14,
              fontFamily: 'var(--sans)',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '2px solid var(--rule)',
                  textAlign: 'left',
                }}
              >
                {['Ticker', 'Company', 'Shares', 'Value (USD)', '% of Portfolio', 'Actions'].map(col => (
                  <th
                    key={col}
                    style={{
                      padding: '8px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-3)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary, i) => {
                const holding = holdings[i]
                return (
                  <tr
                    key={holding.id}
                    style={{
                      borderBottom: '1px solid var(--rule)',
                    }}
                  >
                    <td style={{ padding: '12px 12px' }}>
                      <span
                        style={{
                          fontFamily: 'var(--mono)',
                          fontWeight: 700,
                          fontSize: 14,
                          color: 'var(--ink)',
                        }}
                      >
                        {summary.ticker}
                      </span>
                    </td>
                    <td style={{ padding: '12px 12px', color: 'var(--ink-2)' }}>
                      {summary.company_name}
                    </td>
                    {/* Shares column — F1 */}
                    <td
                      style={{
                        padding: '12px 12px',
                        fontFamily: 'var(--mono)',
                        color: 'var(--ink-2)',
                      }}
                    >
                      {holding.qty != null ? Number(holding.qty).toFixed(2) : '—'}
                    </td>
                    <td
                      style={{
                        padding: '12px 12px',
                        fontFamily: 'var(--mono)',
                        color: 'var(--ink)',
                      }}
                    >
                      {formatUsd(summary.total_value_usd)}
                    </td>
                    <td
                      style={{
                        padding: '12px 12px',
                        fontFamily: 'var(--mono)',
                        color: 'var(--ink-2)',
                      }}
                    >
                      {summary.pct_of_portfolio}%
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setEditingHolding(holding)}
                          aria-label={`Edit ${holding.ticker}`}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 'var(--r)',
                            fontSize: 12,
                            fontWeight: 600,
                            border: '1.5px solid var(--rule)',
                            background: 'white',
                            color: 'var(--ink-2)',
                            cursor: 'pointer',
                            fontFamily: 'var(--sans)',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(holding.id)}
                          aria-label={`Delete ${holding.ticker}`}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 'var(--r)',
                            fontSize: 12,
                            fontWeight: 600,
                            border: 'none',
                            background: 'var(--red-50, #fef2f2)',
                            color: 'var(--red-600, #dc2626)',
                            cursor: 'pointer',
                            fontFamily: 'var(--sans)',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals section */}
      <div
        style={{
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 360,
          marginLeft: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>
            Holdings total
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            {formatUsd(totals.holdings_usd)}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>
            Cash
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink)',
            }}
          >
            {formatUsd(totals.cash_usd)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--rule)',
            paddingTop: 10,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--ink)',
              fontFamily: 'var(--sans)',
            }}
          >
            Grand total
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontWeight: 800,
              fontSize: 18,
              color: 'var(--ink)',
            }}
          >
            {formatUsd(totals.grand_total_usd)}
          </span>
        </div>
      </div>

      {/* Latest recommendation card */}
      {latestRecommendation && (
        <div
          style={{
            marginTop: 32,
            padding: '20px 24px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--display)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--ink)',
              marginBottom: 8,
            }}
          >
            Latest Analysis
          </h2>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }}>
            {new Date(latestRecommendation.run_at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          {latestRecommendation.summary_text && (
            <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 12 }}>
              {latestRecommendation.summary_text.length > 200
                ? latestRecommendation.summary_text.slice(0, 200) + '…'
                : latestRecommendation.summary_text}
            </p>
          )}
          <Link
            href={`/portfolio/recommendations/${latestRecommendation.id}`}
            style={{
              fontSize: 14,
              color: 'var(--r)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            View full recommendation →
          </Link>
        </div>
      )}

      {/* Modal */}
      {(showAddModal || editingHolding !== null) && (
        <HoldingForm
          holdingToEdit={editingHolding}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}
