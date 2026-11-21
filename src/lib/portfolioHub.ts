import type { AlpacaOrderResult, LiveHolding, TargetAllocationItem, TargetHorizon } from '@/types/database'
import type { ShariahScreeningResult, TickerScreening } from '@/types/shariah'

/**
 * Pure helpers for the Portfolio hub (specs/025-portfolio-trading-hub).
 */

// ── URL params ───────────────────────────────────────────────────────────────

export const HUB_TABS = ['overview', 'rebalance', 'activity', 'settings'] as const
export type HubTab = (typeof HUB_TABS)[number]

export const HUB_TAB_LABELS: Record<HubTab, string> = {
  overview:  'Overview',
  rebalance: 'Rebalance',
  activity:  'Activity',
  settings:  'Settings',
}

function firstParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

export function parseHubTab(raw: string | string[] | undefined): HubTab {
  const v = firstParam(raw)
  return (HUB_TABS as readonly string[]).includes(v ?? '') ? (v as HubTab) : 'overview'
}

export const CHART_PERIODS = ['1W', '1M', '3M', '1Y'] as const
export type ChartPeriod = (typeof CHART_PERIODS)[number]

/** Nominal calendar days per period, used to prorate the target return. */
export const PERIOD_DAYS: Record<ChartPeriod, number> = { '1W': 7, '1M': 30, '3M': 91, '1Y': 365 }

/** Alpaca portfolio-history timeframe per period (hourly points for a week, daily otherwise). */
export const PERIOD_TIMEFRAME: Record<ChartPeriod, '1H' | '1D'> = { '1W': '1H', '1M': '1D', '3M': '1D', '1Y': '1D' }

export function parseChartPeriod(raw: string | string[] | undefined): ChartPeriod {
  const v = firstParam(raw)?.toUpperCase()
  return (CHART_PERIODS as readonly string[]).includes(v ?? '') ? (v as ChartPeriod) : '1M'
}

export function parsePage(raw: string | string[] | undefined, max: number): number {
  const n = parseInt(firstParam(raw) ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, max)
}

// ── Settings sections (specs/028-portfolio-hub-ux-cleanup) ───────────────────

export const SETTINGS_SECTIONS = ['setup', 'strategy', 'automation', 'safety', 'notifications'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
export const DEFAULT_SETTINGS_SECTION: SettingsSection = 'setup'

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  setup:         'Setup',
  strategy:      'Strategy',
  automation:    'Automation',
  safety:        'Safety',
  notifications: 'Notifications',
}

export const SETTINGS_SECTION_DESCRIPTIONS: Record<SettingsSection, string> = {
  setup:         'Connect Alpaca and add your Claude API key.',
  strategy:      'Target return, risk profile and Islamic screening.',
  automation:    'Scheduled analysis and autopilot.',
  safety:        'Risk limits, dry run and the trading kill switch.',
  notifications: 'Trading emails.',
}

/** Old anchors / names that still resolve to a section (e.g. links that pointed at #alpaca or #ai-key). */
const SETTINGS_SECTION_ALIASES: Record<string, SettingsSection> = {
  alpaca:    'setup',
  'ai-key':  'setup',
  ai_key:    'setup',
  ai:        'setup',
  targets:   'strategy',
  autopilot: 'automation',
  schedule:  'automation',
  risk:      'safety',
  email:     'notifications',
}

/** `?section=` → a settings section; unknown / missing → setup. Accepts legacy anchor names. */
export function parseSettingsSection(raw: string | string[] | undefined): SettingsSection {
  const v = firstParam(raw)?.trim().toLowerCase().replace(/^#/, '') ?? ''
  if ((SETTINGS_SECTIONS as readonly string[]).includes(v)) return v as SettingsSection
  return SETTINGS_SECTION_ALIASES[v] ?? DEFAULT_SETTINGS_SECTION
}

export type HubHrefParams = {
  tab?: HubTab | null
  section?: SettingsSection | null
  /** Fragment appended after the query (no leading #), e.g. 'alpaca'. */
  hash?: string | null
} & Record<string, string | number | null | undefined>

/** Build a hub URL, dropping empty params. The single URL builder for /portfolio links. */
export function hubHref(params: HubHrefParams): string {
  const q = new URLSearchParams()
  let hash = ''
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    if (k === 'hash') { hash = `#${String(v)}`; continue }
    q.set(k, String(v))
  }
  const s = q.toString()
  return `${s ? `/portfolio?${s}` : '/portfolio'}${hash}`
}

/** Link to one Settings section (optionally an anchor inside it). */
export function settingsHref(section: SettingsSection = DEFAULT_SETTINGS_SECTION, hash?: string): string {
  return hubHref({ tab: 'settings', section, hash })
}

// ── Returns ──────────────────────────────────────────────────────────────────

/** Today's change from Alpaca equity vs last_equity (previous close). Null when either is unknown. */
export function computeDayChange(
  equity: number | null | undefined,
  lastEquity: number | null | undefined,
): { change_usd: number; change_pct: number | null } | null {
  if (equity == null || lastEquity == null || !Number.isFinite(equity) || !Number.isFinite(lastEquity)) return null
  const change = equity - lastEquity
  return { change_usd: change, change_pct: lastEquity > 0 ? (change / lastEquity) * 100 : null }
}

/**
 * Return over the charted period, in percent.
 * Prefers Alpaca's deposit-adjusted cumulative profit_loss_pct (fraction) at the last point;
 * falls back to last / first positive equity. Null when there is not enough data.
 */
export function computePeriodReturnPct(
  equity: Array<number | null>,
  profitLossPct: Array<number | null> = [],
): number | null {
  for (let i = profitLossPct.length - 1; i >= 0; i--) {
    const v = profitLossPct[i]
    if (v !== null && Number.isFinite(v)) return v * 100
  }
  const values = equity.filter((v): v is number => v !== null && Number.isFinite(v))
  const first = values.find(v => v > 0)
  const last = values[values.length - 1]
  if (first === undefined || last === undefined || values.length < 2) return null
  return (last / first - 1) * 100
}

const DAYS_PER_YEAR = 365
const DAYS_PER_MONTH = 365.25 / 12

/** The user's target return (annual or monthly) compounded down/up to `days`, in percent. */
export function proratedTargetPct(targetPct: number, horizon: TargetHorizon, days: number): number {
  if (!Number.isFinite(targetPct) || !Number.isFinite(days) || days <= 0) return 0
  const base = horizon === 'monthly' ? DAYS_PER_MONTH : DAYS_PER_YEAR
  return (Math.pow(1 + targetPct / 100, days / base) - 1) * 100
}

// ── Allocation drift ─────────────────────────────────────────────────────────

export interface AllocationRow {
  ticker: string
  current_pct: number
  target_pct: number
  /** current − target, percentage points. */
  drift_pct: number
}

export const CASH_TICKER = 'CASH'

/**
 * Current vs target weight per ticker (union of held and targeted tickers) plus a cash row.
 * Weights are against total account value (holdings + cash); cash's target is what the stock targets leave over.
 * Sorted by absolute drift, largest first (cash last on ties).
 */
export function computeAllocationDrift(
  holdings: Array<Pick<LiveHolding, 'ticker' | 'total_value_usd'>>,
  cashUsd: number,
  target: Array<Pick<TargetAllocationItem, 'ticker' | 'target_pct'>> | null,
): AllocationRow[] {
  const cash = Number.isFinite(cashUsd) && cashUsd > 0 ? cashUsd : 0
  const total = holdings.reduce((s, h) => s + (h.total_value_usd > 0 ? h.total_value_usd : 0), 0) + cash
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const targetMap = new Map<string, number>()
  for (const t of target ?? []) {
    if (t.ticker.toUpperCase() === CASH_TICKER) continue
    targetMap.set(t.ticker, (targetMap.get(t.ticker) ?? 0) + (Number.isFinite(t.target_pct) ? t.target_pct : 0))
  }
  const currentMap = new Map<string, number>()
  for (const h of holdings) currentMap.set(h.ticker, (currentMap.get(h.ticker) ?? 0) + pct(h.total_value_usd))

  const tickers = new Set([...currentMap.keys(), ...targetMap.keys()])
  const rows: AllocationRow[] = [...tickers].map(ticker => {
    const current_pct = currentMap.get(ticker) ?? 0
    const target_pct = targetMap.get(ticker) ?? 0
    return { ticker, current_pct, target_pct, drift_pct: current_pct - target_pct }
  })
  rows.sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct) || a.ticker.localeCompare(b.ticker))

  if (cash > 0 || target !== null) {
    const stockTarget = [...targetMap.values()].reduce((s, v) => s + v, 0)
    const cashTarget = target === null ? 0 : Math.max(0, 100 - stockTarget)
    const cashCurrent = pct(cash)
    rows.push({ ticker: CASH_TICKER, current_pct: cashCurrent, target_pct: cashTarget, drift_pct: cashCurrent - cashTarget })
  }
  return rows
}

// ── Holdings detail ──────────────────────────────────────────────────────────

export interface TickerTrade {
  recommendation_id: string
  executed_at: string
  action: 'buy' | 'sell'
  status: AlpacaOrderResult['status']
  qty: number
  value_usd: number
  price: number | null
  dry_run: boolean
}

/** Most recent trades for one ticker across executions (newest first). Skipped rows are left out. */
export function tradesForTicker(
  executions: Array<{ recommendation_id: string; executed_at: string; dry_run: boolean; orders: AlpacaOrderResult[] }>,
  ticker: string,
  limit = 5,
): TickerTrade[] {
  const trades: TickerTrade[] = []
  for (const ex of executions) {
    for (const o of ex.orders) {
      if (o.ticker !== ticker || o.status === 'skipped') continue
      const filledQty = o.filled_qty ?? null
      const price = o.filled_avg_price ?? (o.price_at_execution > 0 ? o.price_at_execution : null)
      const qty = filledQty !== null && filledQty > 0 ? filledQty : o.qty
      trades.push({
        recommendation_id: ex.recommendation_id,
        executed_at:       o.filled_at ?? o.submitted_at ?? ex.executed_at,
        action:            o.action,
        status:            o.status,
        qty,
        value_usd:         filledQty && o.filled_avg_price ? filledQty * o.filled_avg_price : (o.notional ?? o.estimated_value),
        price,
        dry_run:           ex.dry_run,
      })
    }
  }
  trades.sort((a, b) => Date.parse(b.executed_at) - Date.parse(a.executed_at))
  return trades.slice(0, limit)
}

export type ShariahBadge =
  | { kind: 'compliant'; reason: string | null; screening: TickerScreening }
  | { kind: 'flagged'; reason: string; screening: TickerScreening }
  | { kind: 'unscreened' }

/** Badge for a holding from the latest screening. */
export function shariahBadgeFor(ticker: string, screening: ShariahScreeningResult | null): ShariahBadge {
  const t = screening?.tickers.find(s => s.ticker === ticker)
  if (!t) return { kind: 'unscreened' }
  if (t.verdict === 'compliant') return { kind: 'compliant', reason: t.reasons[0] ?? null, screening: t }
  return { kind: 'flagged', reason: t.reasons[0] ?? 'Not Shariah-compliant', screening: t }
}

/** "+$1,234.56" / "−$12.00" */
export function formatSignedUsd(v: number): string {
  const abs = Math.abs(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v > 0) return `+${abs}`
  if (v < 0) return `−${abs}`
  return abs
}

/** "+1.23%" / "−0.40%" */
export function formatSignedPct(v: number, dp = 2): string {
  const abs = Math.abs(v).toFixed(dp)
  if (v > 0 && Number(abs) > 0) return `+${abs}%`
  if (v < 0 && Number(abs) > 0) return `−${abs}%`
  return `${(0).toFixed(dp)}%`
}

/** A run still marked "running" this long after it started is treated as stale (not resumed in the UI). */
export const RUN_RESUME_WINDOW_MS = 60 * 60 * 1000

/** The id of a run to keep showing progress for: status running and started within the resume window. */
export function inProgressRunId(
  run: { id: string; status: string; run_at: string } | null | undefined,
  now: Date,
): string | null {
  if (!run || run.status !== 'running') return null
  const started = Date.parse(run.run_at)
  if (!Number.isFinite(started)) return null
  return now.getTime() - started < RUN_RESUME_WINDOW_MS ? run.id : null
}
