import type { AlpacaOrderResult, AuditAction, ExecutionStatus } from '@/types/database'
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '@/lib/notifications/types'

/**
 * Pure Activity-tab timeline (specs/025-portfolio-trading-hub): turn rows from recommendations, alpaca_executions,
 * notification_log and audit_log into one newest-first list, then filter and paginate.
 */

export const ACTIVITY_PAGE_SIZE = 30
export const ACTIVITY_MAX_PAGES = 10

export type ActivityKind = 'run' | 'approval' | 'execution' | 'notification' | 'audit'
export type ActivityTone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'

export interface ActivityItem {
  /** Unique key: `<kind>:<source id>`. */
  key: string
  kind: ActivityKind
  at: string
  title: string
  detail: string | null
  tone: ActivityTone
  /** Recommendation this item belongs to (links to the detail page). */
  recommendation_id: string | null
  /** Executions only: not yet in a terminal state. */
  open: boolean
  badges: string[]
}

export const ACTIVITY_FILTERS = ['all', 'runs', 'orders', 'alerts', 'open'] as const
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number]

export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = {
  all:    'All',
  runs:   'Runs',
  orders: 'Orders',
  alerts: 'Alerts',
  open:   'Open orders',
}

/** Empty-state copy per filter (specs/028). */
export const ACTIVITY_EMPTY_STATE: Record<ActivityFilter, { title: string; detail: string }> = {
  all:    { title: 'Nothing here yet', detail: 'Analysis runs, approvals, orders, emails and settings changes will appear here.' },
  runs:   { title: 'No analysis runs yet', detail: 'Run an analysis from the Rebalance tab to get started.' },
  orders: { title: 'No orders yet', detail: 'Executions from a recommendation (including dry runs) will appear here.' },
  alerts: { title: 'No emails sent yet', detail: 'Trading emails appear here once notifications are turned on.' },
  open:   { title: 'No open orders', detail: 'Orders waiting to fill or waiting for the market to open will appear here.' },
}

export function parseActivityFilter(raw: string | string[] | undefined): ActivityFilter {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (ACTIVITY_FILTERS as readonly string[]).includes(v ?? '') ? (v as ActivityFilter) : 'all'
}

// ── Builders ─────────────────────────────────────────────────────────────────

export function runActivity(row: {
  id: string
  run_at: string
  status: string
  error_message: string | null
  trigger: 'manual' | 'schedule'
  cost_label: string | null
}): ActivityItem {
  const trigger = row.trigger === 'schedule' ? 'Scheduled' : 'Manual'
  const statusText = row.status === 'complete' ? 'complete' : row.status === 'error' ? 'failed' : row.status
  const detailParts = [row.status === 'error' && row.error_message ? row.error_message : null, row.cost_label ? `Cost ${row.cost_label}` : null]
  return {
    key:               `run:${row.id}`,
    kind:              'run',
    at:                row.run_at,
    title:             `${trigger} analysis ${statusText}`,
    detail:            detailParts.filter(Boolean).join(' · ') || null,
    tone:              row.status === 'error' ? 'bad' : row.status === 'complete' ? 'info' : 'neutral',
    recommendation_id: row.id,
    open:              false,
    badges:            [trigger],
  }
}

/** Approval outcome of a scheduled run. Pending runs produce no item (the Overview card covers them). */
export function approvalActivity(row: {
  recommendation_id: string
  status: 'pending' | 'approved' | 'rejected' | 'expired' | null
  decided_at: string | null
  expires_at: string | null
}): ActivityItem | null {
  if (row.status === 'approved' || row.status === 'rejected') {
    if (!row.decided_at) return null
    return {
      key:               `approval:${row.recommendation_id}`,
      kind:              'approval',
      at:                row.decided_at,
      title:             row.status === 'approved' ? 'Recommendation approved' : 'Recommendation rejected',
      detail:            null,
      tone:              row.status === 'approved' ? 'good' : 'neutral',
      recommendation_id: row.recommendation_id,
      open:              false,
      badges:            [],
    }
  }
  if (row.status === 'expired' && row.expires_at) {
    return {
      key:               `approval:${row.recommendation_id}`,
      kind:              'approval',
      at:                row.expires_at,
      title:             'Approval expired',
      detail:            'No decision within 24 hours — nothing was traded.',
      tone:              'warn',
      recommendation_id: row.recommendation_id,
      open:              false,
      badges:            [],
    }
  }
  return null
}

const EXECUTION_TITLES: Record<ExecutionStatus, string> = {
  pending:               'Execution queued',
  waiting_for_market:    'Execution waiting for market open',
  executing:             'Execution in progress',
  completed:             'Execution completed',
  completed_with_errors: 'Execution completed with errors',
  failed:                'Execution failed',
  cancelled:             'Execution cancelled',
  dry_run_completed:     'Dry run completed',
}

const EXECUTION_TONE: Record<ExecutionStatus, ActivityTone> = {
  pending:               'info',
  waiting_for_market:    'info',
  executing:             'info',
  completed:             'good',
  completed_with_errors: 'warn',
  failed:                'bad',
  cancelled:             'bad',
  dry_run_completed:     'neutral',
}

const TERMINAL: ExecutionStatus[] = ['completed', 'completed_with_errors', 'failed', 'cancelled', 'dry_run_completed']

/** "3 filled · 1 skipped" style counts. */
export function summariseOrders(orders: AlpacaOrderResult[]): string {
  const counts = new Map<string, number>()
  const bucket = (o: AlpacaOrderResult): string => {
    switch (o.status) {
      case 'filled': return 'filled'
      case 'partially_filled': return 'partly filled'
      case 'planned':
      case 'submitted': return 'open'
      case 'simulated': return 'simulated'
      case 'skipped': return 'skipped'
      default: return 'failed'
    }
  }
  for (const o of orders) counts.set(bucket(o), (counts.get(bucket(o)) ?? 0) + 1)
  const order = ['filled', 'partly filled', 'open', 'simulated', 'failed', 'skipped']
  const parts = order.filter(k => counts.has(k)).map(k => `${counts.get(k)} ${k}`)
  return parts.length ? `${orders.length} order${orders.length === 1 ? '' : 's'}: ${parts.join(' · ')}` : 'No orders'
}

export function executionActivity(row: {
  id: string
  recommendation_id: string
  executed_at: string
  status: ExecutionStatus
  dry_run: boolean
  is_paper: boolean
  error_message: string | null
  orders: AlpacaOrderResult[]
}): ActivityItem {
  const badges = [row.is_paper ? 'Paper' : 'Live']
  if (row.dry_run) badges.unshift('Dry run')
  const detail = [summariseOrders(row.orders), row.error_message].filter(Boolean).join(' · ')
  return {
    key:               `execution:${row.id}`,
    kind:              'execution',
    at:                row.executed_at,
    title:             EXECUTION_TITLES[row.status],
    detail,
    tone:              EXECUTION_TONE[row.status],
    recommendation_id: row.recommendation_id,
    open:              !TERMINAL.includes(row.status),
    badges,
  }
}

function notificationLabel(type: string): string {
  if (type === 'test') return 'Test email'
  return NOTIFICATION_TYPE_LABELS[type as NotificationType]?.label ?? type.replace(/_/g, ' ')
}

export function notificationActivity(
  row: { id: string; type: string; entity_id: string; status: string; error: string | null; created_at: string },
  recommendationIdFor: (entityId: string) => string | null,
): ActivityItem {
  const sent = row.status === 'sent'
  return {
    key:               `notification:${row.id}`,
    kind:              'notification',
    at:                row.created_at,
    title:             `Email: ${notificationLabel(row.type)}`,
    detail:            sent ? null : `${row.status === 'failed' ? 'Not delivered' : 'Skipped'}${row.error ? ` — ${row.error}` : ''}`,
    tone:              row.status === 'failed' ? 'warn' : 'neutral',
    recommendation_id: recommendationIdFor(row.entity_id),
    open:              false,
    badges:            [sent ? 'Sent' : row.status === 'failed' ? 'Failed' : 'Skipped'],
  }
}

/** Portfolio / trading audit actions shown in Activity (runs, executions and approvals come from their own rows). */
export const ACTIVITY_AUDIT_ACTIONS: Partial<Record<AuditAction, { title: string; tone: ActivityTone }>> = {
  trading_paused:                  { title: 'Trading paused',               tone: 'bad' },
  trading_resumed:                 { title: 'Trading resumed',              tone: 'good' },
  risk_limits_updated:             { title: 'Risk & safety settings changed', tone: 'neutral' },
  autopilot_mode_changed:          { title: 'Autopilot mode changed',       tone: 'neutral' },
  portfolio_settings_updated:      { title: 'Portfolio settings changed',   tone: 'neutral' },
  alpaca_credentials_connected:    { title: 'Alpaca account connected',     tone: 'neutral' },
  alpaca_credentials_disconnected: { title: 'Alpaca account disconnected',  tone: 'warn' },
  alpaca_safeguards_applied:       { title: 'Account safeguards applied',   tone: 'neutral' },
  notification_test_sent:          { title: 'Test email sent',              tone: 'neutral' },
}

function describeChanges(changed: Record<string, { before: unknown; after: unknown }> | null): string | null {
  if (!changed) return null
  const fmt = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? 'updated' : String(v))
  const parts = Object.entries(changed)
    .slice(0, 3)
    .map(([k, { before, after }]) => `${k.replace(/_/g, ' ')}: ${fmt(before)} → ${fmt(after)}`)
  const more = Object.keys(changed).length - parts.length
  return parts.length ? parts.join(' · ') + (more > 0 ? ` · +${more} more` : '') : null
}

export function auditActivity(row: {
  id: string
  action: string
  created_at: string
  changed_fields: Record<string, { before: unknown; after: unknown }> | null
}): ActivityItem | null {
  const meta = ACTIVITY_AUDIT_ACTIONS[row.action as AuditAction]
  if (!meta) return null
  return {
    key:               `audit:${row.id}`,
    kind:              'audit',
    at:                row.created_at,
    title:             meta.title,
    detail:            describeChanges(row.changed_fields),
    tone:              meta.tone,
    recommendation_id: null,
    open:              false,
    badges:            [],
  }
}

// ── Merge / filter / paginate ────────────────────────────────────────────────

function ts(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

/** Merge item lists newest first; ties keep a stable order by key. Duplicate keys keep the first occurrence. */
export function mergeTimeline(...lists: Array<Array<ActivityItem | null>>): ActivityItem[] {
  const seen = new Set<string>()
  const all: ActivityItem[] = []
  for (const list of lists) {
    for (const item of list) {
      if (!item || seen.has(item.key)) continue
      seen.add(item.key)
      all.push(item)
    }
  }
  return all.sort((a, b) => ts(b.at) - ts(a.at) || a.key.localeCompare(b.key))
}

export function filterTimeline(items: ActivityItem[], filter: ActivityFilter): ActivityItem[] {
  switch (filter) {
    case 'runs':   return items.filter(i => i.kind === 'run' || i.kind === 'approval')
    case 'orders': return items.filter(i => i.kind === 'execution')
    case 'alerts': return items.filter(i => i.kind === 'notification' || i.kind === 'audit')
    case 'open':   return items.filter(i => i.kind === 'execution' && i.open)
    default:       return items
  }
}

/** 1-based page of `pageSize`; `hasMore` when items exist past this page. */
export function paginateTimeline(
  items: ActivityItem[],
  page: number,
  pageSize = ACTIVITY_PAGE_SIZE,
): { items: ActivityItem[]; hasMore: boolean } {
  const p = Math.max(1, Math.floor(page))
  const start = (p - 1) * pageSize
  return { items: items.slice(start, start + pageSize), hasMore: items.length > start + pageSize }
}
