import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { nowFor, requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { LabInputSchema, MilestoneTaskInputSchema, WaistInputSchema, labInputToPanel, milestoneTaskKey, waistInputToCm } from '@/lib/health/measurements'
import { p2DbError } from '@/lib/health/p2Server'

/**
 * Measurements, lipid panels and milestone ticks (specs/029 US9, phase P2).
 * POST { action: 'waist', date, value, unit } — upsert per date (stored in cm)
 * POST { action: 'lab', date, unit, total?, ldl?, hdl?, tg? } — stored in mmol/L
 * POST { action: 'milestone', week, task, done } — task must be one of the programme's milestone tasks
 * DELETE ?kind=waist|lab&id=
 */

const ActionSchema = z.enum(['waist', 'lab', 'milestone'])

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  const { action: rawAction, ...rest } = raw as Record<string, unknown>
  const action = ActionSchema.safeParse(rawAction)
  if (!action.success) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const bad = (issues: Array<{ message: string }>) => NextResponse.json({ error: issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const waist = action.data === 'waist' ? WaistInputSchema.safeParse(rest) : null
  const lab = action.data === 'lab' ? LabInputSchema.safeParse(rest) : null
  const tick = action.data === 'milestone' ? MilestoneTaskInputSchema.safeParse(rest) : null
  if (waist && !waist.success) return bad(waist.error.issues)
  if (lab && !lab.success) return bad(lab.error.issues)
  if (tick && !tick.success) return bad(tick.error.issues)

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const today = nowFor(enrolment).date

  if (waist?.success) {
    const body = waist.data
    if (body.date > today) return NextResponse.json({ error: 'Cannot record a future date' }, { status: 400 })
    const cm = waistInputToCm(body)
    if (cm === null) return NextResponse.json({ error: 'That waist measurement looks wrong — check the unit' }, { status: 400 })
    const { error } = await supabase.from('health_measurements').upsert(
      { user_id: user.id, local_date: body.date, kind: 'waist', value: cm },
      { onConflict: 'user_id,local_date,kind' },
    )
    if (error) return p2DbError(error)
    return NextResponse.json({ saved: true, cm })
  }

  if (lab?.success) {
    if (lab.data.date > today) return NextResponse.json({ error: 'Cannot record a future date' }, { status: 400 })
    const panel = labInputToPanel(lab.data)
    if (!panel.ok) return NextResponse.json({ error: panel.error }, { status: 400 })
    const { error } = await supabase.from('health_lab_results').insert({
      user_id: user.id,
      taken_on: panel.panel.date,
      total_mmol: panel.panel.totalMmol,
      ldl_mmol: panel.panel.ldlMmol,
      hdl_mmol: panel.panel.hdlMmol,
      tg_mmol: panel.panel.tgMmol,
      entered_unit: lab.data.unit,
      notes: lab.data.notes ?? null,
    })
    if (error) return p2DbError(error)
    return NextResponse.json({ saved: true })
  }

  if (!tick?.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const body = tick.data
  const milestone = enrolment.def.milestones.find(m => m.week === body.week)
  if (!milestone || !milestone.tasks.includes(body.task)) return NextResponse.json({ error: 'Unknown milestone task' }, { status: 400 })
  const key = milestoneTaskKey(body.week, body.task)
  const { error } = body.done
    ? await supabase.from('health_milestone_checks').upsert(
        { user_id: user.id, enrolment_id: enrolment.id, week: body.week, task_key: key },
        { onConflict: 'enrolment_id,task_key' },
      )
    : await supabase.from('health_milestone_checks').delete().eq('user_id', user.id).eq('enrolment_id', enrolment.id).eq('task_key', key)
  if (error) return p2DbError(error)
  return NextResponse.json({ saved: true })
}

const DeleteSchema = z.object({ kind: z.enum(['waist', 'lab']), id: z.string().uuid() })

export async function DELETE(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const q = DeleteSchema.safeParse({ kind: request.nextUrl.searchParams.get('kind'), id: request.nextUrl.searchParams.get('id') })
  if (!q.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const supabase = await createClient()
  const table = q.data.kind === 'waist' ? 'health_measurements' : 'health_lab_results'
  const { data, error } = await supabase.from(table).delete().eq('id', q.data.id).eq('user_id', auth.user.id).select('id')
  if (error) return p2DbError(error)
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
