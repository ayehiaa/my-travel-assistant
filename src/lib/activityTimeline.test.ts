import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_EMPTY_STATE,
  ACTIVITY_FILTERS,
  approvalActivity,
  auditActivity,
  executionActivity,
  filterTimeline,
  mergeTimeline,
  notificationActivity,
  paginateTimeline,
  parseActivityFilter,
  runActivity,
  summariseOrders,
  type ActivityItem,
} from './activityTimeline'
import type { AlpacaOrderResult } from '@/types/database'

function order(status: AlpacaOrderResult['status']): AlpacaOrderResult {
  return { ticker: 'A', action: 'buy', qty: 1, price_at_execution: 1, estimated_value: 1, alpaca_order_id: null, status, error_message: null }
}

const run = runActivity({ id: 'r1', run_at: '2026-11-18T15:30:00Z', status: 'complete', error_message: null, trigger: 'schedule', cost_label: '$0.27' })
const failedRun = runActivity({ id: 'r0', run_at: '2026-11-17T15:30:00Z', status: 'error', error_message: 'Synth failed', trigger: 'manual', cost_label: null })
const approval = approvalActivity({ recommendation_id: 'r1', status: 'approved', decided_at: '2026-11-18T16:00:00Z', expires_at: null })
const openExec = executionActivity({
  id: 'e1', recommendation_id: 'r1', executed_at: '2026-11-18T16:01:00Z', status: 'waiting_for_market', dry_run: false,
  is_paper: true, error_message: null, orders: [order('planned'), order('planned')],
})
const doneExec = executionActivity({
  id: 'e0', recommendation_id: 'r0', executed_at: '2026-11-17T16:01:00Z', status: 'dry_run_completed', dry_run: true,
  is_paper: true, error_message: null, orders: [order('simulated'), order('skipped')],
})
const email = notificationActivity(
  { id: 'n1', type: 'execution_completed', entity_id: 'e1', status: 'sent', error: null, created_at: '2026-11-18T17:00:00Z' },
  id => (id === 'e1' ? 'r1' : null),
)
const pause = auditActivity({ id: 'a1', action: 'trading_paused', created_at: '2026-11-19T09:00:00Z', changed_fields: { trading_paused: { before: false, after: true } } })

describe('builders', () => {
  it('describes runs with trigger and cost', () => {
    expect(run).toMatchObject({ key: 'run:r1', kind: 'run', title: 'Scheduled analysis complete', detail: 'Cost $0.27', recommendation_id: 'r1' })
    expect(failedRun).toMatchObject({ title: 'Manual analysis failed', detail: 'Synth failed', tone: 'bad' })
  })

  it('creates approval items only for decided / expired runs', () => {
    expect(approval).toMatchObject({ title: 'Recommendation approved', at: '2026-11-18T16:00:00Z', tone: 'good' })
    expect(approvalActivity({ recommendation_id: 'r', status: 'rejected', decided_at: '2026-11-18T16:00:00Z', expires_at: null })!.title)
      .toBe('Recommendation rejected')
    expect(approvalActivity({ recommendation_id: 'r', status: 'expired', decided_at: null, expires_at: '2026-11-19T15:30:00Z' }))
      .toMatchObject({ title: 'Approval expired', at: '2026-11-19T15:30:00Z', tone: 'warn' })
    expect(approvalActivity({ recommendation_id: 'r', status: 'pending', decided_at: null, expires_at: 'x' })).toBeNull()
    expect(approvalActivity({ recommendation_id: 'r', status: null, decided_at: null, expires_at: null })).toBeNull()
    expect(approvalActivity({ recommendation_id: 'r', status: 'approved', decided_at: null, expires_at: null })).toBeNull()
  })

  it('marks non-terminal executions open and counts orders', () => {
    expect(openExec).toMatchObject({ open: true, title: 'Execution waiting for market open', badges: ['Paper'], detail: '2 orders: 2 open' })
    expect(doneExec).toMatchObject({ open: false, title: 'Dry run completed', badges: ['Dry run', 'Paper'] })
    expect(doneExec.detail).toBe('2 orders: 1 simulated · 1 skipped')
  })

  it('summarises order buckets', () => {
    expect(summariseOrders([])).toBe('No orders')
    expect(summariseOrders([order('filled'), order('rejected'), order('partially_filled')])).toBe('3 orders: 1 filled · 1 partly filled · 1 failed')
  })

  it('labels notifications and resolves their recommendation', () => {
    expect(email).toMatchObject({ title: 'Email: Execution completed', recommendation_id: 'r1', badges: ['Sent'], detail: null })
    const failed = notificationActivity(
      { id: 'n2', type: 'test', entity_id: 'x', status: 'failed', error: 'Bad key', created_at: '2026-11-18T17:00:00Z' },
      () => null,
    )
    expect(failed).toMatchObject({ title: 'Email: Test email', detail: 'Not delivered — Bad key', tone: 'warn', recommendation_id: null })
  })

  it('keeps only portfolio audit actions and describes changes', () => {
    expect(pause).toMatchObject({ title: 'Trading paused', tone: 'bad', detail: 'trading paused: false → true' })
    expect(auditActivity({ id: 'a2', action: 'expense_created', created_at: '2026-11-19T09:00:00Z', changed_fields: null })).toBeNull()
    expect(auditActivity({ id: 'a3', action: 'run_triggered', created_at: '2026-11-19T09:00:00Z', changed_fields: null })).toBeNull()
  })
})

describe('mergeTimeline / filterTimeline / paginateTimeline', () => {
  const all = mergeTimeline([run, failedRun, approval], [openExec, doneExec], [email], [pause, null])

  it('sorts newest first and drops nulls and duplicate keys', () => {
    expect(all.map(i => i.key)).toEqual([
      'audit:a1', 'notification:n1', 'execution:e1', 'approval:r1', 'run:r1', 'execution:e0', 'run:r0',
    ])
    expect(mergeTimeline([run], [run])).toHaveLength(1)
  })

  it('breaks timestamp ties by key so order is stable', () => {
    const a: ActivityItem = { ...run, key: 'b', at: '2026-01-01T00:00:00Z' }
    const b: ActivityItem = { ...run, key: 'a', at: '2026-01-01T00:00:00Z' }
    expect(mergeTimeline([a, b]).map(i => i.key)).toEqual(['a', 'b'])
  })

  it('filters by chip', () => {
    expect(filterTimeline(all, 'all')).toHaveLength(7)
    expect(filterTimeline(all, 'runs').map(i => i.kind)).toEqual(['approval', 'run', 'run'])
    expect(filterTimeline(all, 'orders').map(i => i.key)).toEqual(['execution:e1', 'execution:e0'])
    expect(filterTimeline(all, 'alerts').map(i => i.kind)).toEqual(['audit', 'notification'])
    expect(filterTimeline(all, 'open').map(i => i.key)).toEqual(['execution:e1'])
  })

  it('paginates', () => {
    expect(paginateTimeline(all, 1, 3)).toEqual({ items: all.slice(0, 3), hasMore: true })
    expect(paginateTimeline(all, 3, 3)).toEqual({ items: all.slice(6), hasMore: false })
    expect(paginateTimeline(all, 0, 3).items).toEqual(all.slice(0, 3))
  })

  it('parses filters', () => {
    expect(parseActivityFilter('open')).toBe('open')
    expect(parseActivityFilter('bogus')).toBe('all')
    expect(parseActivityFilter(undefined)).toBe('all')
  })
})

describe('ACTIVITY_EMPTY_STATE', () => {
  it('has copy for every filter', () => {
    for (const f of ACTIVITY_FILTERS) {
      expect(ACTIVITY_EMPTY_STATE[f].title.length).toBeGreaterThan(0)
      expect(ACTIVITY_EMPTY_STATE[f].detail.length).toBeGreaterThan(0)
    }
    expect(ACTIVITY_EMPTY_STATE.open.title).toBe('No open orders')
  })
})
