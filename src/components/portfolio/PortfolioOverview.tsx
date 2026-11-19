'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LivePortfolio } from '@/types/database'
import { computeHoldingSummaries, formatUsd } from '@/lib/portfolioCalculator'

interface Props {
  connected: boolean
  portfolio: LivePortfolio | null
  liveError: boolean
  latestRecommendation?: { id: string; run_at: string; summary_text: string | null } | null
}

// Fixed locale + time zone so server and client render the same string (no hydration mismatch)
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

const settingsLinkStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 'var(--r)',
  fontSize: 14,
  fontWeight: 600,
  border: '1.5px solid var(--rule)',
  background: 'white',
  color: 'var(--ink-2)',
  fontFamily: 'var(--sans)',
  textDecoration: 'none',
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
}

const emptyBoxStyle: React.CSSProperties = {
  border: '2px dashed var(--rule)',
  borderRadius: 'var(--r-lg)',
  padding: '48px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  textAlign: 'center',
}

export default function PortfolioOverview({ connected, portfolio, liveError, latestRecommendation }: Props) {
  const router = useRouter()
  const [isRefreshing, startRefresh] = useTransition()

  function handleRefresh() {
    startRefresh(() => router.refresh())
  }

  // ── Not connected: Alpaca is the only source of portfolio data ────────────
  if (!connected) {
    return (
      <div style={emptyBoxStyle}>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-2)', fontWeight: 600 }}>
          Connect your Alpaca account
        </p>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)', maxWidth: 420 }}>
          Your holdings and cash are read live from Alpaca. Connect an account in Portfolio Settings to see your
          portfolio and run an analysis.
        </p>
        <Link href="/portfolio/settings" style={settingsLinkStyle}>
          Go to Settings →
        </Link>
      </div>
    )
  }

  // ── Connected but Alpaca unreachable: show no stale numbers ───────────────
  if (liveError || !portfolio) {
    return (
      <>
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 text-amber-800 rounded flex items-center justify-between gap-3 px-4 py-3 mb-4 text-sm"
        >
          <span>Could not reach Alpaca to load your portfolio.</span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="font-semibold text-amber-800 bg-transparent border-none cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isRefreshing ? 'Retrying…' : 'Retry'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link href="/portfolio/settings" style={settingsLinkStyle}>
            Settings
          </Link>
        </div>
      </>
    )
  }

  const { holdings, cash_usd, is_paper, fetched_at } = portfolio
  const { summaries, totals } = computeHoldingSummaries(holdings, cash_usd)

  return (
    <>
      {/* Live status line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          fontSize: 13,
          color: 'var(--ink-3)',
          flexWrap: 'wrap',
        }}
      >
        <span>
          Live from Alpaca{' '}
          <span
            style={{
              background: is_paper ? '#fef3c7' : '#dcfce7',
              color: is_paper ? '#92400e' : '#16a34a',
              padding: '2px 8px',
              borderRadius: 20,
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {is_paper ? 'PAPER' : 'LIVE'}
          </span>
        </span>
        <span style={{ color: 'var(--rule)' }}>·</span>
        <span suppressHydrationWarning>as of {formatTime(fetched_at)}</span>
        <span style={{ color: 'var(--rule)' }}>·</span>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: isRefreshing ? 'default' : 'pointer',
            color: 'var(--ink-3)',
            fontSize: 13,
            fontFamily: 'var(--sans)',
            textDecoration: isRefreshing ? 'none' : 'underline',
            opacity: isRefreshing ? 0.6 : 1,
          }}
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
        <Link href="/portfolio/settings" style={settingsLinkStyle}>
          Settings
        </Link>
      </div>

      {holdings.length === 0 ? (
        <div style={{ ...emptyBoxStyle, marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-3)', fontWeight: 500 }}>
            {cash_usd > 0
              ? 'No positions yet. Run an analysis to get a starting portfolio built from your cash.'
              : 'No positions or cash in this Alpaca account yet. Fund the account to get started.'}
          </p>
        </div>
      ) : (
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
              <tr style={{ borderBottom: '2px solid var(--rule)', textAlign: 'left' }}>
                {['Ticker', 'Company', 'Shares', 'Value (USD)', '% of Portfolio'].map(col => (
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
              {summaries.map((summary, i) => (
                <tr key={summary.ticker} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                      {summary.ticker}
                    </span>
                  </td>
                  <td style={{ padding: '12px 12px', color: 'var(--ink-2)' }}>{summary.company_name}</td>
                  <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
                    {holdings[i].qty.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
                    {formatUsd(summary.total_value_usd)}
                  </td>
                  <td style={{ padding: '12px 12px', fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>
                    {summary.pct_of_portfolio}%
                  </td>
                </tr>
              ))}
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
        {[
          ['Holdings total', totals.holdings_usd],
          ['Cash', totals.cash_usd],
        ].map(([label, value]) => (
          <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>{label}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
              {formatUsd(value as number)}
            </span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid var(--rule)',
            paddingTop: 10,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--sans)' }}>
            Grand total
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>
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
            style={{ fontSize: 14, color: 'var(--r)', fontWeight: 600, textDecoration: 'none' }}
          >
            View full recommendation →
          </Link>
        </div>
      )}
    </>
  )
}
