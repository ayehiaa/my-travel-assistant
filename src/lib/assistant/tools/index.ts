import type Anthropic from '@anthropic-ai/sdk'
import { isAreaAllowed } from '../areas'
import { capToolResult } from '../truncate'
import { invalidInputResult, toolBlockedReason, toolSpec, validateToolInput, type ToolName } from '../toolDefs'
import { zonedParts } from '../text'
import { ToolError, type ToolContext } from './context'
import { daysOutsideUk, expenseSummary, listTrips, queryExpenses, tripDetails } from './travel'
import { foodLog, healthToday, programmeOverview, trainingLog, weeklyReview, weightTrendTool } from './lifestyle'
import { executions, latestRecommendation, performance, portfolioLive, riskSettings, screeningSettings } from './trading'

/**
 * Server only — runs one tool call: validate input (Zod) → re-check access for the tool's area → execute → compact
 * JSON. Errors become `is_error` results with a short message (never stack traces, keys or SQL).
 */

type Executor = (ctx: ToolContext, input: never) => Promise<unknown>

function getContext(ctx: ToolContext) {
  const { date, time, weekday } = zonedParts(ctx.now, ctx.timeZone)
  return {
    today: date,
    weekday,
    local_time: time,
    timezone: ctx.timeZone,
    home_country: 'United Kingdom',
    account_type: ctx.access.accountType,
    viewing: ctx.access.accountType === 'assistant' ? (ctx.viewingName ?? 'the linked member') : 'own account',
    enabled_areas: ctx.areas.filter(a => isAreaAllowed(ctx.access, a)),
  }
}

const EXECUTORS: Record<ToolName, Executor> = {
  get_context: async ctx => getContext(ctx),
  list_trips: listTrips as Executor,
  trip_details: tripDetails as Executor,
  days_outside_uk: daysOutsideUk as Executor,
  query_expenses: queryExpenses as Executor,
  expense_summary: expenseSummary as Executor,
  health_today: healthToday as Executor,
  food_log: foodLog as Executor,
  weight_trend: weightTrendTool as Executor,
  training_log: trainingLog as Executor,
  weekly_review: weeklyReview as Executor,
  programme_overview: programmeOverview as Executor,
  portfolio_live: portfolioLive as Executor,
  latest_recommendation: latestRecommendation as Executor,
  executions: executions as Executor,
  performance: performance as Executor,
  screening_settings: screeningSettings as Executor,
  risk_settings: riskSettings as Executor,
}

function errorResult(id: string, message: string): Anthropic.Beta.BetaToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, is_error: true, content: message }
}

export async function runTool(ctx: ToolContext, call: { id: string; name: string; input: unknown }): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const blocked = toolBlockedReason(call.name, ctx.areas, ctx.access)
  const spec = toolSpec(call.name)
  if (blocked || !spec) return errorResult(call.id, blocked ?? 'Unknown tool.')
  const checked = validateToolInput(call.name, call.input)
  if (!checked.ok) return invalidInputResult(call.id, call.input)
  try {
    const value = await EXECUTORS[spec.name](ctx, checked.input as never)
    return { type: 'tool_result', tool_use_id: call.id, content: capToolResult(value) }
  } catch (err) {
    return errorResult(call.id, err instanceof ToolError ? err.message : 'This lookup failed — the data could not be read right now.')
  }
}
