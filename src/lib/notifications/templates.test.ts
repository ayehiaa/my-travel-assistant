import { describe, expect, it } from 'vitest'
import { buildNotificationEmail } from './templates'
import type { ExecutionPayload } from './types'

const ctx = { baseUrl: 'https://app.example' }
const REC = '11111111-2222-4333-8444-555555555555'

function expectWellFormed(email: { subject: string; text: string; html: string }) {
  expect(email.subject.length).toBeGreaterThan(0)
  expect(email.text.length).toBeGreaterThan(0)
  expect(email.html.startsWith('<!DOCTYPE html>')).toBe(true)
  expect(email.html).toContain('https://app.example/portfolio?tab=settings&amp;section=notifications')
  expect(email.text).toContain('https://app.example/portfolio?tab=settings&section=notifications')
}

describe('run_completed', () => {
  it('includes summary, top trades and the link', () => {
    const email = buildNotificationEmail('run_completed', {
      recommendation_id: REC,
      trigger:           'schedule',
      summary:           'Rotate into <tech> & trim energy',
      total_value_usd:   12345.6,
      top_trades:        [{ ticker: 'MSFT', action: 'buy', amount_usd: 1500 }, { ticker: 'XOM', action: 'sell', amount_usd: 900 }],
      trade_count:       4,
    }, ctx)
    expectWellFormed(email)
    expect(email.subject).toBe('Scheduled analysis complete — 4 trades recommended')
    expect(email.text).toContain('BUY  MSFT   $1,500.00')
    expect(email.text).toContain('…and 2 more')
    expect(email.text).toContain(`https://app.example/portfolio/recommendations/${REC}`)
    expect(email.html).toContain('Rotate into &lt;tech&gt; &amp; trim energy')
    expect(email.html).not.toContain('<tech>')
    expect(email.html).toContain('$12,345.60')
  })

  it('handles a run with no trades', () => {
    const email = buildNotificationEmail('run_completed', {
      recommendation_id: REC, trigger: 'manual', summary: null, total_value_usd: null, top_trades: [], trade_count: 0,
    }, ctx)
    expect(email.subject).toBe('Analysis complete — no trades recommended')
    expect(email.text).toContain('No trades recommended.')
  })
})

describe('approval emails', () => {
  it('approval_needed shows expiry in New York and UK time and the approve link', () => {
    const email = buildNotificationEmail('approval_needed', {
      recommendation_id: REC,
      expires_at:        '2026-11-21T15:30:00Z',
      trade_count:       1,
      top_trades:        [{ ticker: 'AAPL', action: 'buy', amount_usd: 100 }],
      dry_run:           true,
    }, ctx)
    expectWellFormed(email)
    expect(email.subject).toContain('Sat 21 Nov 2026, 10:30 New York / 15:30 UK')
    expect(email.text).toContain('Expires: Sat 21 Nov 2026, 10:30 New York / 15:30 UK')
    expect(email.text).toContain('Dry run is ON')
    expect(email.html).toContain('Review &amp; approve')
    expect(email.html).toContain(`/portfolio/recommendations/${REC}`)
  })

  it('approval_expired says nothing was executed', () => {
    const email = buildNotificationEmail('approval_expired', { recommendation_id: REC, expired_at: '2026-11-21T15:30:00Z' }, ctx)
    expectWellFormed(email)
    expect(email.subject).toBe('Approval expired — nothing was executed')
  })
})

describe('execution emails', () => {
  const base: ExecutionPayload = {
    execution_id:      'e',
    recommendation_id: REC,
    status:            'completed',
    dry_run:           false,
    is_paper:          true,
    error_message:     null,
    orders: [
      { ticker: 'AAPL', action: 'buy', amount_usd: 402, qty: 2, status: 'filled', filled_avg_price: 201, note: null },
      { ticker: 'XOM', action: 'sell', amount_usd: 300, qty: 3, status: 'rejected', filled_avg_price: null, note: 'not <allowed>' },
    ],
  }

  it('renders the per-order outcome table', () => {
    const email = buildNotificationEmail('execution_completed_with_errors', { ...base, status: 'completed_with_errors' }, ctx)
    expectWellFormed(email)
    expect(email.subject).toBe('Trades executed with errors — 1 filled, 1 failed (paper account)')
    expect(email.html).toContain('Fill price')
    expect(email.html).toContain('not &lt;allowed&gt;')
    expect(email.text).toContain('AAPL')
    expect(email.text).toContain('Filled @ $201.00')
  })

  it('completed / dry run / failed / cancelled variants', () => {
    expect(buildNotificationEmail('execution_completed', base, ctx).subject).toBe('Trades executed — 1 order filled (paper account)')
    expect(buildNotificationEmail('dry_run_completed', { ...base, dry_run: true, status: 'dry_run_completed' }, ctx).subject)
      .toBe('Dry run complete — 2 orders simulated')
    const failed = buildNotificationEmail('execution_failed', { ...base, status: 'failed', is_paper: false, error_message: 'Market closed' }, ctx)
    expect(failed.subject).toBe('Execution failed (live account)')
    expect(failed.text).toContain('Reason: Market closed')
    expect(buildNotificationEmail('execution_failed', { ...base, status: 'cancelled' }, ctx).subject).toBe('Execution cancelled (paper account)')
  })
})

describe('safety emails', () => {
  it('trading_paused includes the reason and source', () => {
    const manual = buildNotificationEmail('trading_paused', { reason: 'Going on holiday', source: 'manual', paused_at: '2026-11-20T15:30:00Z' }, ctx)
    expectWellFormed(manual)
    expect(manual.subject).toBe('Trading paused')
    expect(manual.text).toContain('Reason: Going on holiday')
    const auto = buildNotificationEmail('trading_paused', { reason: 'Daily loss 3.2% exceeds 3%', source: 'loss_stop', paused_at: '2026-11-20T15:30:00Z' }, ctx)
    expect(auto.subject).toBe('Trading paused — loss stop triggered')
    expect(auto.text).toContain('automatic loss stop')
  })

  it('trading_resumed', () => {
    const email = buildNotificationEmail('trading_resumed', { resumed_at: '2026-11-20T15:30:00Z' }, ctx)
    expectWellFormed(email)
    expect(email.subject).toBe('Trading resumed')
  })
})

describe('shariah_status_change', () => {
  it('is a Divest email listing ticker, reason and the SELL', () => {
    const email = buildNotificationEmail('shariah_status_change', {
      recommendation_id: REC,
      items: [
        { ticker: 'AAPL', name: 'Apple Inc.', reasons: ['Debt ratio 45% exceeds 30%'], has_sell: true },
        { ticker: 'XYZ', name: null, reasons: ['Interest income'], has_sell: false },
      ],
    }, ctx)
    expectWellFormed(email)
    expect(email.subject).toBe('Divest: AAPL, XYZ no longer Shariah-compliant')
    expect(email.text).toContain('AAPL (Apple Inc.): Debt ratio 45% exceeds 30%')
    expect(email.text).toContain('The recommendation includes a SELL.')
    expect(email.html).toContain('SELL included')
    expect(email.html).toContain('No SELL')
  })
})

describe('weekly_summary', () => {
  it('summarises runs, executions, P&L and Shariah status', () => {
    const email = buildNotificationEmail('weekly_summary', {
      week_ending: '2026-11-20T22:00:00Z',
      runs:        [{ id: 'r', run_at: '2026-11-18T15:30:00Z', trigger: 'schedule', status: 'complete' }],
      executions:  [{ id: 'e', executed_at: '2026-11-18T16:00:00Z', status: 'dry_run_completed', dry_run: true, order_count: 3 }],
      pnl:         { start_equity: 10000, end_equity: 10250, change_usd: 250, change_pct: 2.5 },
      shariah:     { screened_at: 'x', compliant: ['MSFT'], non_compliant: [{ ticker: 'BAC', reason: 'Conventional bank' }] },
    }, ctx)
    expectWellFormed(email)
    expect(email.subject).toBe('Weekly portfolio summary — week ending 20 Nov 2026')
    expect(email.text).toContain('+$250.00 (+2.50%)')
    expect(email.text).toContain('Dry run (dry run)  3 orders')
    expect(email.text).toContain('NOT compliant: BAC (Conventional bank)')
    expect(email.html).toContain('Analysis runs (1)')
  })

  it('handles an empty week without P&L or screening', () => {
    const email = buildNotificationEmail('weekly_summary', {
      week_ending: '2026-11-20T22:00:00Z', runs: [], executions: [], pnl: null, shariah: null,
    }, ctx)
    expect(email.text).toContain('Change in account value: Not available')
    expect(email.text).toContain('No screening yet.')
  })
})

describe('test email', () => {
  it('builds', () => {
    const email = buildNotificationEmail('test', { sent_at: '2026-11-20T15:30:00Z' }, ctx)
    expectWellFormed(email)
    expect(email.subject).toContain('Test email')
  })
})

describe('safety of content', () => {
  it('never renders the API key or anything from the environment', () => {
    const email = buildNotificationEmail('run_completed', {
      recommendation_id: REC, trigger: 'manual', summary: 'x', total_value_usd: 1, top_trades: [], trade_count: 0,
    }, ctx)
    expect(email.html).not.toMatch(/re_[A-Za-z0-9]/)
    expect(email.text).not.toMatch(/re_[A-Za-z0-9]/)
  })
})
