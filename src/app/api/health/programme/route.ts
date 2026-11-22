import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireEnrolment, requireHealthUser } from '@/lib/health/healthServer'
import { SectionKeySchema, normaliseValue, programmeDiff, replaceSection, sectionMeta, type SectionValue } from '@/lib/health/programmeImport'
import { retargetAfterEdit } from '@/lib/health/programmeEdit'
import { TargetOverridesSchema } from '@/lib/health/targets'
import {
  P3MigrationNeeded, P3_MIGRATION_MESSAGE, auditHealth, insertProgramme, latestPerLineage, loadProgrammeDefinition,
  loadProgrammeRows, p3DbError,
} from '@/lib/health/p3Server'

/**
 * The active programme (specs/029 US1 acceptance 4): GET versions + the user's programmes; PATCH edits one section
 * (or restores an earlier version) → a NEW programme row (next version of the lineage, with a diff summary); the
 * enrolment moves to it. Energy / macro edits recompute targets, keeping accepted adjustments.
 */

const PatchSchema = z.union([
  z.object({ section: SectionKeySchema, value: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ restore: z.string().uuid() }).strict(),
])

function migration503() {
  return NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
}

export async function GET() {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, auth.user.id)
  if (!enrol.ok) return enrol.response
  try {
    const rows = await loadProgrammeRows(supabase, auth.user.id)
    const current = rows.find(r => r.id === enrol.enrolment.programmeId)
    const versions = current ? rows.filter(r => r.lineageId === current.lineageId).sort((a, b) => b.versionNo - a.versionNo) : []
    return NextResponse.json({ currentId: enrol.enrolment.programmeId, versions, programmes: latestPerLineage(rows) })
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return migration503()
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = PatchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const body = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol

  let rows
  try {
    rows = await loadProgrammeRows(supabase, user.id)
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return migration503()
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  const currentRow = rows.find(r => r.id === enrolment.programmeId)
  if (!currentRow) return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
  const lineage = rows.filter(r => r.lineageId === currentRow.lineageId)
  const nextVersion = Math.max(...lineage.map(r => r.versionNo)) + 1

  let nextDef
  let label: string
  if ('restore' in body) {
    const target = lineage.find(r => r.id === body.restore)
    if (!target) return NextResponse.json({ error: 'Version not found in this programme' }, { status: 404 })
    const loaded = await loadProgrammeDefinition(supabase, user.id, target.id).catch(() => null)
    if (!loaded) return NextResponse.json({ error: 'That version could not be read' }, { status: 422 })
    nextDef = loaded.def
    label = `restored version ${target.versionNo}`
  } else {
    const r = replaceSection(enrolment.def, body.section, (normaliseValue(body.value) as SectionValue | undefined) ?? {})
    if (!r.ok) return NextResponse.json({ error: r.errors[0] ?? 'Invalid section', errors: r.errors }, { status: 400 })
    nextDef = r.definition
    label = sectionMeta(body.section).label
  }

  const diff = programmeDiff(enrolment.def, nextDef)
  if (diff.length === 0) return NextResponse.json({ error: 'No changes to save' }, { status: 400 })
  const summary = 'restore' in body ? [`Restored version ${lineage.find(r => r.id === body.restore)!.versionNo}`, ...diff.map(d => d.summary)] : diff.map(d => d.summary)

  const inserted = await insertProgramme(supabase, user.id, {
    def: nextDef,
    source: 'edit',
    lineageId: currentRow.lineageId,
    parentId: currentRow.id,
    versionNo: nextVersion,
    changeSummary: summary.slice(0, 20),
  })
  if (!inserted.ok) return p3DbError(inserted.error)

  const overrides = TargetOverridesSchema.safeParse(enrolment.overrides)
  const retarget = retargetAfterEdit(enrolment.def, nextDef, enrolment.profile, overrides.success ? overrides.data : {}, enrolment.targets)
  const upd = await supabase
    .from('health_enrolments')
    .update({ programme_id: inserted.id, effective_targets: retarget.targets, updated_at: new Date().toISOString() })
    .eq('id', enrolment.id)
    .eq('user_id', user.id)
  if (upd.error) {
    await supabase.from('health_programmes').delete().eq('id', inserted.id).eq('user_id', user.id)
    return p3DbError(upd.error)
  }

  // No programme content in the audit log — only which section changed and the version numbers.
  await auditHealth(user.id, 'health_programme_updated', {
    change: { before: null, after: label },
    version: { before: currentRow.versionNo, after: nextVersion },
  })
  return NextResponse.json({ programmeId: inserted.id, version: nextVersion, summary, targetsChanged: retarget.changed })
}
