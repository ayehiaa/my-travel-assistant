/**
 * Email notification types and payloads (specs/023-trading-notifications).
 * Payloads are plain JSON (they travel inside Inngest events) and never contain API keys or account numbers.
 */

export const NOTIFICATION_TYPES = [
  'run_completed',
  'approval_needed',
  'approval_expired',
  'execution_completed',
  'execution_completed_with_errors',
  'execution_failed',
  'dry_run_completed',
  'trading_paused',
  'trading_resumed',
  'shariah_status_change',
  'weekly_summary',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** Every type plus the test email (not a preference — always allowed when explicitly requested). */
export type EmailKind = NotificationType | 'test'

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { label: string; help: string }> = {
  run_completed:                   { label: 'Analysis completed',         help: 'Summary and top trades after every run' },
  approval_needed:                 { label: 'Approval needed',            help: 'A scheduled recommendation is waiting for you' },
  approval_expired:                { label: 'Approval expired',           help: 'The 24-hour approval window closed' },
  execution_completed:             { label: 'Execution completed',        help: 'Every order filled' },
  execution_completed_with_errors: { label: 'Execution finished with errors', help: 'Some orders failed or were skipped' },
  execution_failed:                { label: 'Execution failed or cancelled', help: 'Nothing (more) was traded' },
  dry_run_completed:               { label: 'Dry run completed',          help: 'What would have been traded' },
  trading_paused:                  { label: 'Trading paused',             help: 'Kill switch or automatic loss stop' },
  trading_resumed:                 { label: 'Trading resumed',            help: 'The pause was lifted' },
  shariah_status_change:           { label: 'Divest alert',               help: 'A holding is no longer Shariah-compliant' },
  weekly_summary:                  { label: 'Weekly summary',             help: 'Fridays after the US close' },
}

export interface TradeLine {
  ticker: string
  action: 'buy' | 'sell'
  amount_usd: number
}

export interface RunCompletedPayload {
  recommendation_id: string
  trigger: 'manual' | 'schedule'
  summary: string | null
  total_value_usd: number | null
  top_trades: TradeLine[]
  trade_count: number
}

export interface ApprovalNeededPayload {
  recommendation_id: string
  expires_at: string
  trade_count: number
  top_trades: TradeLine[]
  dry_run: boolean
}

export interface ApprovalExpiredPayload {
  recommendation_id: string
  expired_at: string
}

export interface OrderOutcomeLine {
  ticker: string
  action: 'buy' | 'sell'
  amount_usd: number
  qty: number | null
  status: string
  filled_avg_price: number | null
  note: string | null
}

export interface ExecutionPayload {
  execution_id: string
  recommendation_id: string
  status: string
  dry_run: boolean
  is_paper: boolean
  error_message: string | null
  orders: OrderOutcomeLine[]
}

export interface TradingPausedPayload {
  reason: string
  source: 'manual' | 'loss_stop'
  paused_at: string
}

export interface TradingResumedPayload {
  resumed_at: string
}

export interface DivestItem {
  ticker: string
  name: string | null
  reasons: string[]
  has_sell: boolean
}

export interface ShariahStatusChangePayload {
  recommendation_id: string
  items: DivestItem[]
}

export interface WeeklySummaryPayload {
  week_ending: string
  runs: Array<{ id: string; run_at: string; trigger: 'manual' | 'schedule'; status: string }>
  executions: Array<{ id: string; executed_at: string; status: string; dry_run: boolean; order_count: number }>
  pnl: { start_equity: number; end_equity: number; change_usd: number; change_pct: number | null } | null
  shariah: {
    screened_at: string | null
    compliant: string[]
    non_compliant: Array<{ ticker: string; reason: string }>
  } | null
}

export interface TestPayload {
  sent_at: string
}

export interface NotificationPayloads {
  run_completed: RunCompletedPayload
  approval_needed: ApprovalNeededPayload
  approval_expired: ApprovalExpiredPayload
  execution_completed: ExecutionPayload
  execution_completed_with_errors: ExecutionPayload
  execution_failed: ExecutionPayload
  dry_run_completed: ExecutionPayload
  trading_paused: TradingPausedPayload
  trading_resumed: TradingResumedPayload
  shariah_status_change: ShariahStatusChangePayload
  weekly_summary: WeeklySummaryPayload
  test: TestPayload
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

/** Data of the `notifications/send` Inngest event. */
export interface NotificationEventData {
  user_id: string
  type: NotificationType
  entity_id: string
  idempotency_key: string
  payload: unknown
}

export const NOTIFICATION_SEND_EVENT = 'notifications/send'
export const APPROVAL_PENDING_EVENT = 'portfolio/approval.pending'
export const WEEKLY_SUMMARY_EVENT = 'notifications/weekly-summary.requested'
