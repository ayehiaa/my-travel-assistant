import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { MealPlanPatchSchema, cleanChoices } from '@/lib/health/mealPlan'
import { weekStart } from '@/lib/health/time'
import { P3MigrationNeeded, P3_MIGRATION_MESSAGE, loadMealPlan, p3DbError } from '@/lib/health/p3Server'

/** Meal plan for an ISO week (specs/029 US13): swaps per day × slot and shopping-list ticks. Not audited (personal log). */

function badWeek(week: string): boolean {
  return weekStart(week) !== week
}

export async function GET(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const week = request.nextUrl.searchParams.get('week') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || badWeek(week)) return NextResponse.json({ error: 'week must be a Monday (YYYY-MM-DD)' }, { status: 400 })
  const supabase = await createClient()
  try {
    return NextResponse.json(await loadMealPlan(supabase, auth.user.id, week))
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = MealPlanPatchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { week, choices, checked } = parsed.data
  if (badWeek(week)) return NextResponse.json({ error: 'week must be a Monday' }, { status: 400 })
  if (choices === undefined && checked === undefined) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, auth.user.id)
  if (!enrol.ok) return enrol.response

  const row: Record<string, unknown> = { user_id: auth.user.id, week_start: week, updated_at: new Date().toISOString() }
  if (choices !== undefined) row.choices = cleanChoices(enrol.enrolment.def, choices)
  if (checked !== undefined) row.checked = [...new Set(checked)]
  const { error } = await supabase.from('health_meal_plans').upsert(row, { onConflict: 'user_id,week_start' })
  if (error) return p3DbError(error)
  return NextResponse.json({ saved: true, choices: row.choices, checked: row.checked })
}
