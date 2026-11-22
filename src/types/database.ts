import type { ShariahScreeningResult } from '@/types/shariah'

/** LEGACY user_roles.role — still written for compatibility; access decisions use src/lib/access.ts (specs/027). */
export type UserRole = 'main' | 'assistant' | 'premium' | 'premium_plus'

export type UserRoleStatus = 'active' | 'deactivated'

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'assistant_invited'
  | 'assistant_deactivated'
  | 'assistant_unlinked'
  | 'expense_created'
  | 'expense_updated'
  | 'expense_deleted'
  | 'expense_reclaimed'
  | 'expense_unreclaimed'
  | 'holding_created'
  | 'holding_updated'
  | 'holding_deleted'
  | 'portfolio_settings_updated'
  | 'run_triggered'
  | 'alpaca_credentials_connected'
  | 'alpaca_credentials_disconnected'
  | 'alpaca_executed'
  | 'alpaca_synced'
  | 'alpaca_safeguards_applied'
  | 'trading_paused'
  | 'trading_resumed'
  | 'risk_limits_updated'
  | 'recommendation_approved'
  | 'recommendation_rejected'
  | 'autopilot_mode_changed'
  | 'notification_test_sent'
  | 'ai_key_connected'
  | 'ai_key_disconnected'
  | 'user_plan_changed'
  | 'user_features_changed'
  | 'customer_invited'
  | 'customer_invitation_revoked'
  | 'health_consent_given'
  | 'health_programme_activated'
  | 'health_adjustment_accepted'
  | 'health_adjustment_declined'

export interface UserRoleRecord {
  user_id: string
  /** Legacy — see src/lib/access.ts. */
  role: UserRole
  display_name: string
  status: UserRoleStatus
  created_at: string
  /** Migration 20261121b (missing before it is applied → derived from role by deriveAccess). */
  account_type?: 'member' | 'assistant'
  plan?: 'free' | 'plus'
  features?: string[]
}

export type InvitationStatus = 'pending' | 'active' | 'expired'

export interface AccountLink {
  id: string
  main_user_id: string
  assistant_user_id: string
  created_by: string
  created_at: string
  status: InvitationStatus
  invited_at: string | null
  expires_at: string | null
}

export type CustomerInvitationStatus = 'pending' | 'accepted' | 'expired'

export interface CustomerInvitation {
  id: string
  invited_by: string
  email: string
  invited_name: string
  token: string
  status: CustomerInvitationStatus
  invited_at: string
  expires_at: string
  /** Legacy role kept in sync with plan/features (migration 20261121; missing column → read as 'main'). */
  role?: 'main' | 'premium' | 'premium_plus'
  /** Plan + add-ons granted at signup (migration 20261121b; missing → derived from role). */
  plan?: 'free' | 'plus'
  features?: string[]
}

export interface Trip {
  id: string
  owner_id: string
  source: 'search' | 'manual'
  trip_type: 'round_trip' | 'multi_city' | 'one_way'
  days_outside_uk: number
  created_by: string
  last_modified_by: string
  created_at: string
  updated_at: string
}

export interface TripLeg {
  id: string
  trip_id: string
  leg_order: number
  from_airport: string
  to_airport: string
  airline: string | null
  flight_number: string | null
  departure_at: string
  arrival_at: string | null
  created_at: string
}

export type TripInsert = Omit<Trip, 'id' | 'created_at' | 'updated_at'>
export type TripLegInsert = Omit<TripLeg, 'id' | 'created_at'>

export interface AuditLogEntry {
  id: string
  performed_by: string
  on_behalf_of: string | null
  action: AuditAction
  trip_id: string | null
  trip_snapshot: Trip & { legs: TripLeg[] }
  changed_fields: Record<string, { before: unknown; after: unknown }> | null
  created_at: string
}

// Joined type used in the audit log UI — includes resolved user info
export interface AuditLogEntryWithUser extends AuditLogEntry {
  performer: Pick<UserRoleRecord, 'display_name' | 'role'>
  on_behalf_of_user?: Pick<UserRoleRecord, 'display_name'>
}

// Joined type used in the dashboard — includes resolved creator/modifier names
export interface TripWithUsers extends Trip {
  creator: Pick<UserRoleRecord, 'display_name'>
  modifier: Pick<UserRoleRecord, 'display_name'>
  legs: TripLeg[]
}

export interface ExpenseCategory {
  id: string
  name: string
  display_order: number
}

export interface Expense {
  id: string
  owner_id: string
  trip_id: string | null
  category_id: string
  title: string
  amount: number
  currency: string
  expense_date: string
  notes: string | null
  receipt_url: string | null
  receipt_name: string | null
  reclaimed: boolean
  reclaimed_at: string | null
  reclaimed_by: string | null
  reclaim_reference: string | null
  created_by: string
  last_modified_by: string
  created_at: string
  updated_at: string
}

export type ExpenseInsert = Omit<Expense, 'id' | 'created_at' | 'updated_at'>

export type ExpenseWithCategory = Expense & { category: Pick<ExpenseCategory, 'name'> }

export interface GoogleToken {
  id: string
  user_id: string
  encrypted_access_token: string
  encrypted_refresh_token: string
  token_iv: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface GmailImportedMessage {
  id: string
  user_id: string
  gmail_message_id: string
  trip_id: string | null
  imported_at: string
}

export interface UserProfile {
  user_id: string
  portfolio_tos_accepted_at: string | null
  created_at: string
}

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'

export interface PortfolioHolding {
  id: string
  user_id: string
  ticker: string
  company_name: string
  total_value_usd: number
  qty: number | null
  created_at: string
  updated_at: string
}

/** A position read live from the connected Alpaca account (never stored). */
export interface LiveHolding {
  ticker: string
  company_name: string
  qty: number
  total_value_usd: number
  /** Alpaca position P&L fields — absent when Alpaca did not return a parseable value. */
  avg_entry_price?: number
  current_price?: number
  cost_basis?: number
  unrealized_pl?: number
  /** Fraction, e.g. 0.0523 = +5.23%. */
  unrealized_plpc?: number
}

export interface LivePortfolio {
  holdings: LiveHolding[]
  cash_usd: number
  total_value_usd: number
  is_paper: boolean
  fetched_at: string
  /** Alpaca account equity and previous-close equity (for today's change); null when unavailable. */
  equity_usd?: number | null
  last_equity_usd?: number | null
}

export type TargetHorizon = 'monthly' | 'annual'

export interface PortfolioSettings {
  user_id: string
  cash_usd: number
  target_return_pct: number
  target_horizon: TargetHorizon
  risk_profile: RiskProfile
  /** 1 (daily) needs migration 20261120d; read via parseRunInterval(). */
  run_interval_days: 1 | 7 | 14 | 30
  last_run_at: string | null
  next_run_at: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
  // ── Safety columns (migration 20261120c). Absent until applied — read via readSafetySettings(). ──
  risk_limits?: unknown
  trading_paused?: boolean
  paused_reason?: string | null
  paused_at?: string | null
  dry_run?: boolean
  // ── Autopilot (migration 20261120d). Absent until applied — read via readAutopilotSettings(). ──
  autopilot_mode?: 'off' | 'approval' | 'auto'
}

export type RunStatus = 'running' | 'complete' | 'error'

export type AgentStatus = 'pending' | 'running' | 'complete' | 'error'

export interface RunProgress {
  id: string
  run_id: string
  agent_name: string
  status: AgentStatus
  error_message: string | null
  completed_at: string | null
  created_at: string
}

export interface AgentOutput {
  analysis: string
  confidence: 'low' | 'medium' | 'high'
  stance: 'bullish' | 'bearish' | 'neutral'
}

export interface PortfolioSnapshot {
  holdings: Array<{ ticker: string; company_name: string; total_value_usd: number }>
  cash_usd: number
  total_value_usd: number
}

export interface TargetAllocationItem {
  ticker: string
  target_pct: number
  rationale: string
}

export interface ActionItem {
  ticker: string
  action: 'buy' | 'sell' | 'hold'
  current_pct: number
  target_pct: number
  current_usd: number
  target_usd: number
  delta_usd: number
  /** Why this action was forced, e.g. a holding sold because it failed Shariah screening. */
  note?: string
}

export interface Recommendation {
  id: string
  user_id: string
  run_at: string
  status: RunStatus
  target_allocation: TargetAllocationItem[] | null
  action_list: ActionItem[] | null
  summary_text: string | null
  conflict_notes: string | null
  agent_outputs: Record<string, AgentOutput> | null
  portfolio_snapshot: PortfolioSnapshot | null
  /** Absent until migration 20261120_shariah_screening is applied; see readShariahScreening(). */
  shariah_screening?: ShariahScreeningResult | null
  /** Autopilot columns (migration 20261120d) — read via readAutopilotInfo(); fallback agent_outputs.autopilot. */
  run_trigger?: 'manual' | 'schedule' | null
  approval_status?: 'pending' | 'approved' | 'rejected' | 'expired' | null
  approval_expires_at?: string | null
  approval_decided_at?: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface AlpacaCredential {
  user_id: string
  encrypted_key_id: string
  key_id_iv: string
  encrypted_secret: string
  secret_iv: string
  is_paper: boolean
  created_at: string
  updated_at: string
}

/**
 * Per-order lifecycle status. Legacy rows only use submitted | rejected | error | skipped.
 * planned → submitted → partially_filled → filled | canceled | rejected | expired
 */
export type AlpacaOrderStatus =
  | 'planned'
  | 'submitted'
  | 'partially_filled'
  | 'filled'
  | 'canceled'
  | 'expired'
  | 'rejected'
  | 'error'
  | 'skipped'
  /** Dry run: planned but intentionally never submitted. */
  | 'simulated'

export interface AlpacaOrderResult {
  ticker: string
  action: 'buy' | 'sell'
  /** Share qty (sells, whole-share buys). 0 for notional buys until filled. */
  qty: number
  price_at_execution: number
  estimated_value: number
  alpaca_order_id: string | null
  status: AlpacaOrderStatus
  error_message: string | null
  // ── Engine v2 fields (optional — absent on rows created before the execution engine) ──
  /** USD amount for notional (fractional) buys. */
  notional?: number | null
  client_order_id?: string | null
  fractionable?: boolean
  /** Raw Alpaca order status, e.g. "accepted", "filled". */
  alpaca_status?: string | null
  filled_qty?: number | null
  filled_avg_price?: number | null
  filled_at?: string | null
  submitted_at?: string | null
  updated_at?: string | null
  /** Why the risk limits trimmed this order (blocked orders carry the reason in error_message). */
  risk_note?: string | null
}

export type ExecutionStatus =
  | 'pending'
  | 'waiting_for_market'
  | 'executing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  /** Stopped by the kill switch, a loss stop or a failed safety check. */
  | 'cancelled'
  /** Dry run: fully planned, nothing submitted. */
  | 'dry_run_completed'

/** Shape stored in alpaca_executions.orders by the execution engine (legacy rows store a bare array). */
export interface ExecutionEnvelope {
  version: 2
  status: ExecutionStatus
  updated_at: string
  error_message: string | null
  /** When the engine is waiting for the market, the time it will wake up. */
  wait_until?: string | null
  /** True when the execution runs in dry-run mode (no orders are submitted). */
  dry_run?: boolean
  orders: AlpacaOrderResult[]
}

export interface AlpacaExecution {
  id: string
  recommendation_id: string
  user_id: string
  executed_at: string
  is_paper: boolean
  /** Legacy rows: a bare array. Engine rows: ExecutionEnvelope. Read via normalizeExecution(). */
  orders: AlpacaOrderResult[] | ExecutionEnvelope
}

/** AlpacaExecution with the envelope unwrapped — what the UI and API consume. */
export interface NormalizedExecution {
  id: string
  recommendation_id: string
  user_id: string
  executed_at: string
  is_paper: boolean
  status: ExecutionStatus
  updated_at: string | null
  error_message: string | null
  wait_until: string | null
  dry_run: boolean
  orders: AlpacaOrderResult[]
}
