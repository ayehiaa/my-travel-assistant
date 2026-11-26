import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { isAreaAllowed, type AssistantArea } from './areas'
import type { Access } from '@/lib/access'

/**
 * My Assistant (specs/033) — the read-only tool registry. Pure: names, descriptions, JSON schemas sent to Claude, the
 * Zod schemas every input is validated with before a tool runs, and the friendly labels shown in the UI.
 * The executors live in ./tools (server only).
 */

export type ToolArea = AssistantArea | 'utility'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Optional values: Claude sometimes sends null for "not set" — treat it like absent. */
const dateField = z.string().refine(isRealDate, 'Use a real date as YYYY-MM-DD')
const optDate = dateField.nullish()
const optText = (max: number) => z.string().trim().min(1).max(max).nullish()
const optInt = (min: number, max: number) => z.number().int().min(min).max(max).nullish()

const DATE_PROP = (what: string) => ({ type: 'string', description: `${what} (YYYY-MM-DD, inclusive).` })
const LIMIT_PROP = (max: number, dflt: number) => ({ type: 'integer', description: `Max rows to return, 1–${max} (default ${dflt}).` })
const OFFSET_PROP = { type: 'integer', description: 'Rows to skip for paging, 0–1000 (default 0).' }

export const EXECUTION_STATUSES = [
  'pending', 'waiting_for_market', 'executing', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'dry_run_completed',
] as const

/** Zod input schemas — every tool input is validated with these before anything runs. */
export const TOOL_INPUT_SCHEMAS = {
  get_context: z.strictObject({}),
  list_trips: z.strictObject({
    when: z.enum(['upcoming', 'past', 'all']).nullish(),
    from: optDate,
    to: optDate,
    destination_contains: optText(60),
    limit: optInt(1, 50),
    offset: optInt(0, 1000),
  }),
  trip_details: z.strictObject({ trip_id: z.string().regex(UUID_RE, 'trip_id must be a trip id from list_trips') }),
  days_outside_uk: z.strictObject({
    mode: z.enum(['app_window', 'range']).nullish(),
    from: optDate,
    to: optDate,
  }),
  query_expenses: z.strictObject({
    from: optDate,
    to: optDate,
    category: optText(60),
    trip_id: z.string().regex(UUID_RE).nullish(),
    reclaimed: z.enum(['yes', 'no', 'any']).nullish(),
    text_contains: optText(80),
    limit: optInt(1, 50),
    offset: optInt(0, 1000),
  }),
  expense_summary: z.strictObject({
    group_by: z.enum(['category', 'month', 'trip']),
    from: optDate,
    to: optDate,
    reclaimed: z.enum(['yes', 'no', 'any']).nullish(),
  }),
  health_today: z.strictObject({ date: optDate }),
  food_log: z.strictObject({ from: dateField, to: dateField, slot: optText(40) }),
  weight_trend: z.strictObject({ weeks: optInt(1, 52) }),
  training_log: z.strictObject({ from: optDate, to: optDate, exercise_contains: optText(60) }),
  weekly_review: z.strictObject({ week_of: optDate }),
  programme_overview: z.strictObject({}),
  portfolio_live: z.strictObject({}),
  latest_recommendation: z.strictObject({}),
  executions: z.strictObject({ from: optDate, to: optDate, status: z.enum(EXECUTION_STATUSES).nullish(), limit: optInt(1, 20) }),
  performance: z.strictObject({ period: z.enum(['1W', '1M', '3M', '1A']).nullish() }),
  screening_settings: z.strictObject({}),
  risk_settings: z.strictObject({}),
} as const

export type ToolName = keyof typeof TOOL_INPUT_SCHEMAS
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_INPUT_SCHEMAS)[N]>

export interface ToolSpec {
  name: ToolName
  area: ToolArea
  /** Shown while the tool runs, e.g. "Looking at your trips…". */
  label: string
  description: string
  /** JSON schema sent to Claude (strict-style: additionalProperties false). */
  properties: Record<string, unknown>
  required?: string[]
}

const NO_INPUT = {}

export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: 'get_context', area: 'utility', label: 'Checking the date…',
    description: "Returns today's date and time in the user's timezone, the user's home country (UK), the account type, whose data is being viewed, and which areas (travel, expenses, lifestyle, trading) are enabled. Call it when you need today's date for a relative period such as 'last month'.",
    properties: NO_INPUT,
  },
  {
    name: 'list_trips', area: 'travel', label: 'Looking at your trips…',
    description: "Lists the user's saved trips (newest first for past, soonest first for upcoming) with id, route, first departure, last return/arrival, legs count and days outside the UK for each trip. Filter by upcoming/past/all, a date window that the trip overlaps, or a destination airport code/city text. Paginate with limit/offset; 'total' gives the full match count.",
    properties: {
      when: { type: 'string', enum: ['upcoming', 'past', 'all'], description: "Which trips: 'upcoming' (first departure today or later), 'past', or 'all' (default)." },
      from: DATE_PROP('Only trips that overlap the window starting on this date'),
      to: DATE_PROP('Only trips that overlap the window ending on this date'),
      destination_contains: { type: 'string', description: 'Case-insensitive text matched against any leg airport code, e.g. "JFK" or "DXB".' },
      limit: LIMIT_PROP(50, 20),
      offset: OFFSET_PROP,
    },
  },
  {
    name: 'trip_details', area: 'travel', label: 'Opening the trip…',
    description: 'Returns one trip by id: every flight leg (airports, airline, flight number, departure/arrival), days outside the UK, and the expenses linked to the trip with totals per currency.',
    properties: { trip_id: { type: 'string', description: 'The trip id returned by list_trips.' } },
    required: ['trip_id'],
  },
  {
    name: 'days_outside_uk', area: 'travel', label: 'Counting days outside the UK…',
    description: "Counts days spent outside the UK using the app's rules (the departure day and the return day are not counted). mode 'app_window' (default) uses the same rolling 12-month window as the dashboard, ending at the user's reference date (or today when none is set), and reports the 90-day allowance. mode 'range' counts any from/to window (inclusive, max 5 years). Returns the per-trip breakdown.",
    properties: {
      mode: { type: 'string', enum: ['app_window', 'range'], description: "'app_window' (default) or 'range' (then from and to are required)." },
      from: DATE_PROP('Window start for mode range'),
      to: DATE_PROP('Window end for mode range'),
    },
  },
  {
    name: 'query_expenses', area: 'expenses', label: 'Checking your expenses…',
    description: 'Lists expenses (newest first) with date, title, amount, currency, category, linked trip id and reclaimed status. Filter by date range, category name text, trip id, reclaimed status, or text in the title/notes. Paginate with limit/offset; returns totals per currency for ALL matching rows, not just the page.',
    properties: {
      from: DATE_PROP('Expense date from'),
      to: DATE_PROP('Expense date to'),
      category: { type: 'string', description: 'Case-insensitive text matched against the category name, e.g. "hotel".' },
      trip_id: { type: 'string', description: 'Only expenses linked to this trip id.' },
      reclaimed: { type: 'string', enum: ['yes', 'no', 'any'], description: "Reclaimed status filter (default 'any')." },
      text_contains: { type: 'string', description: 'Case-insensitive text matched against the title and notes.' },
      limit: LIMIT_PROP(50, 25),
      offset: OFFSET_PROP,
    },
  },
  {
    name: 'expense_summary', area: 'expenses', label: 'Adding up your expenses…',
    description: 'Totals expenses grouped by category, month (YYYY-MM) or trip, separately per currency (amounts are never converted between currencies), with reclaimed and pending amounts. Optional date range and reclaimed filter.',
    properties: {
      group_by: { type: 'string', enum: ['category', 'month', 'trip'], description: 'How to group the totals.' },
      from: DATE_PROP('Expense date from'),
      to: DATE_PROP('Expense date to'),
      reclaimed: { type: 'string', enum: ['yes', 'no', 'any'], description: "Reclaimed status filter (default 'any')." },
    },
    required: ['group_by'],
  },
  {
    name: 'health_today', area: 'lifestyle', label: "Reading today's targets…",
    description: "Lifestyle day summary for today (or a past date): calorie and macro targets, eaten totals, remaining budget, daily food-goal (component) progress, the morning check-in (weight, sleep, supplements), the planned training for the day, and the app's ranked recommendations (rules the app fired).",
    properties: { date: DATE_PROP("Local date (default today in the user's timezone)") },
  },
  {
    name: 'food_log', area: 'lifestyle', label: 'Reading your food log…',
    description: 'Food entries between two dates (max 14 days): time, meal slot, the text the user typed, items with kcal/protein/carbs/fat/sat fat/fibre, and daily totals. Optional meal-slot filter (e.g. "breakfast").',
    properties: {
      from: DATE_PROP('First local date'),
      to: DATE_PROP('Last local date'),
      slot: { type: 'string', description: 'Only this meal slot key or name, case-insensitive.' },
    },
    required: ['from', 'to'],
  },
  {
    name: 'weight_trend', area: 'lifestyle', label: 'Checking your weight trend…',
    description: "Weight trend from morning weigh-ins using the app's 7-day averages: weekly averages for the last N weeks, change per week, current rate of loss, latest weigh-in and change since the programme start.",
    properties: { weeks: { type: 'integer', description: 'Number of weeks, 1–52 (default 4).' } },
  },
  {
    name: 'training_log', area: 'lifestyle', label: 'Reading your training log…',
    description: 'Workouts between two dates (default the last 28 days, max 120 days): date, session, status, programme week, and per exercise the sets (load kg, reps, hold seconds, effort) plus best set and change vs the first time in the window. Optional exercise-name filter.',
    properties: {
      from: DATE_PROP('First local date'),
      to: DATE_PROP('Last local date'),
      exercise_contains: { type: 'string', description: 'Case-insensitive text matched against exercise names.' },
    },
  },
  {
    name: 'weekly_review', area: 'lifestyle', label: 'Building the weekly review…',
    description: "The app's weekly review for the week containing a date (default this week): days logged, food goals met, protein and sat-fat days, sessions, cardio minutes, steps, sleep, weight and waist change, and the app's focus points.",
    properties: { week_of: DATE_PROP('Any date in the week (default today)') },
  },
  {
    name: 'programme_overview', area: 'lifestyle', label: 'Reading your programme…',
    description: "The active lifestyle programme: name, start and end dates, current week and phase, daily targets, food goals (components), meal slots, training sessions with exercises, cardio and step targets.",
    properties: NO_INPUT,
  },
  {
    name: 'portfolio_live', area: 'trading', label: 'Fetching live portfolio…',
    description: "Live Alpaca account (read only): holdings with value, weight %, unrealised P&L, cash, total value, today's change and whether the account is paper or live.",
    properties: NO_INPUT,
  },
  {
    name: 'latest_recommendation', area: 'trading', label: 'Reading the latest recommendation…',
    description: "The latest completed portfolio recommendation: run date, target allocation with rationale, cash target, buy/sell/hold actions with notes (e.g. forced Shariah sells), Shariah screening summary, return vs target metrics, summary and conflict notes, approval status.",
    properties: NO_INPUT,
  },
  {
    name: 'executions', area: 'trading', label: 'Checking executions…',
    description: 'Recent trade executions (newest first): date, status, dry run or not, paper or live, and the orders (ticker, side, qty/notional, status, error).',
    properties: {
      from: DATE_PROP('Executed on or after'),
      to: DATE_PROP('Executed on or before'),
      status: { type: 'string', enum: [...EXECUTION_STATUSES], description: 'Only executions with this status.' },
      limit: LIMIT_PROP(20, 10),
    },
  },
  {
    name: 'performance', area: 'trading', label: 'Fetching performance history…',
    description: "Alpaca account performance over a period: start/end equity, deposit-adjusted return %, P&L in USD, best and worst day, and a compact equity series.",
    properties: { period: { type: 'string', enum: ['1W', '1M', '3M', '1A'], description: "Period (default '1M')." } },
  },
  {
    name: 'screening_settings', area: 'trading', label: 'Reading screening settings…',
    description: 'Current Shariah screening configuration (which parts are enabled and what they mean).',
    properties: NO_INPUT,
  },
  {
    name: 'risk_settings', area: 'trading', label: 'Reading risk settings…',
    description: 'Current trading safety configuration: dry run, trading pause and reason, risk limits (drift, turnover, position, cash buffer, single order, loss stops) and autopilot settings.',
    properties: NO_INPUT,
  },
]

const SPEC_BY_NAME = new Map(TOOL_SPECS.map(s => [s.name, s]))

export function toolSpec(name: string): ToolSpec | null {
  return SPEC_BY_NAME.get(name as ToolName) ?? null
}

export function isToolName(name: string): name is ToolName {
  return SPEC_BY_NAME.has(name as ToolName)
}

/** Friendly label for a running tool (unknown names get a generic one). */
export function toolLabel(name: string): string {
  return toolSpec(name)?.label ?? 'Looking that up…'
}

const USED_LABEL: Record<ToolArea, string | null> = {
  utility: null,
  travel: 'Trips',
  expenses: 'Expenses',
  lifestyle: 'Lifestyle',
  trading: 'Portfolio',
}

/** "Used: Trips · Expenses" — distinct area labels for the tools a turn used, in first-use order. */
export function usedSummary(toolNames: readonly string[]): string[] {
  const out: string[] = []
  for (const n of toolNames) {
    const spec = toolSpec(n)
    const label = spec ? USED_LABEL[spec.area] : null
    if (label && !out.includes(label)) out.push(label)
  }
  return out
}

/** Names of the tools offered for these areas (utility always), sorted for a deterministic, cacheable tool list. */
export function toolNamesFor(areas: readonly AssistantArea[]): ToolName[] {
  return TOOL_SPECS.filter(s => s.area === 'utility' || areas.includes(s.area)).map(s => s.name).sort()
}

/**
 * The `tools` array for a request. Deterministic (sorted by name, fixed key order) so the cached prefix is byte-stable.
 * Every tool streams its input eagerly; inputs are validated with Zod before running.
 */
export function buildTools(areas: readonly AssistantArea[]): Anthropic.Beta.BetaTool[] {
  return toolNamesFor(areas).map(name => {
    const spec = SPEC_BY_NAME.get(name)!
    return {
      name: spec.name,
      description: spec.description,
      input_schema: {
        type: 'object' as const,
        properties: spec.properties,
        ...(spec.required ? { required: spec.required } : {}),
        additionalProperties: false,
      },
      eager_input_streaming: true,
    }
  })
}

export type ToolInputCheck = { ok: true; input: unknown } | { ok: false }

/** Validate a tool input with its Zod schema. Unknown tool names fail. */
export function validateToolInput(name: string, input: unknown): ToolInputCheck {
  if (!isToolName(name)) return { ok: false }
  const parsed = TOOL_INPUT_SCHEMAS[name].safeParse(input)
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false }
}

/** The tool_result for input that failed validation (built with JSON.stringify so quotes are escaped). */
export function invalidInputResult(toolUseId: string, input: unknown): Anthropic.Beta.BetaToolResultBlockParam {
  let raw: string
  try {
    raw = JSON.stringify(input) ?? String(input)
  } catch {
    raw = String(input)
  }
  return { type: 'tool_result', tool_use_id: toolUseId, is_error: true, content: JSON.stringify({ INVALID_JSON: raw }) }
}

/**
 * Server-side gate for every call: the tool's area must be declared for this conversation AND allowed for the user
 * right now (an add-on may have been removed after the chat started). Returns a short reason, or null when allowed.
 */
export function toolBlockedReason(name: string, declared: readonly AssistantArea[], access: Pick<Access, 'accountType' | 'effectivePlan' | 'effectiveFeatures'>): string | null {
  const spec = toolSpec(name)
  if (!spec) return `Unknown tool "${name}".`
  if (spec.area === 'utility') return null
  if (!declared.includes(spec.area) || !isAreaAllowed(access, spec.area)) return `The ${spec.area} area is not enabled for this account.`
  return null
}
