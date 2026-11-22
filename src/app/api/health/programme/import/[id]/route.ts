import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireHealthUser } from '@/lib/health/healthServer'
import { MAX_DRAFT_JSON_CHARS, SectionUpdateSchema, normaliseValue, sectionStatus, validateSection, type SectionValue } from '@/lib/health/programmeImport'
import { P3MigrationNeeded, P3_MIGRATION_MESSAGE, loadImportDraft, p3DbError } from '@/lib/health/p3Server'

/**
 * One import draft (specs/029 US1): GET it, PATCH a section (edit value and/or confirm), DELETE (discard).
 * Confirming a section requires it to validate; editing a confirmed section un-confirms it unless re-confirmed.
 */

async function load(id: string, userId: string) {
  if (!z.string().uuid().safeParse(id).success) return { ok: false as const, response: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  const supabase = await createClient()
  try {
    const draft = await loadImportDraft(supabase, userId, id)
    if (!draft) return { ok: false as const, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
    return { ok: true as const, supabase, draft }
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return { ok: false as const, response: NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 }) }
    return { ok: false as const, response: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const r = await load((await params).id, auth.user.id)
  if (!r.ok) return r.response
  return NextResponse.json({ draft: r.draft })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = SectionUpdateSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { section, value, confirmed } = parsed.data

  const r = await load((await params).id, auth.user.id)
  if (!r.ok) return r.response
  const { supabase, draft } = r
  if (draft.status !== 'draft') return NextResponse.json({ error: 'This import is already saved or discarded' }, { status: 409 })

  const sections = { ...draft.sections }
  if (value !== undefined) sections[section] = (normaliseValue(value) as SectionValue | undefined) ?? {}
  let confirmedList = draft.confirmed.filter(k => k !== section)
  if (confirmed) {
    const v = validateSection(section, sections[section])
    if (!v.ok) return NextResponse.json({ error: `Fix this section first: ${v.errors[0]}`, errors: v.errors }, { status: 400 })
    sections[section] = v.value
    confirmedList = [...confirmedList, section]
  }
  if (JSON.stringify(sections).length > MAX_DRAFT_JSON_CHARS) return NextResponse.json({ error: 'The programme is too large' }, { status: 400 })
  const statuses = { ...draft.statuses, [section]: sectionStatus(section, sections[section], false) }

  const { error } = await supabase
    .from('health_programme_imports')
    .update({ sections, statuses, confirmed: confirmedList, updated_at: new Date().toISOString() })
    .eq('id', draft.id)
    .eq('user_id', auth.user.id)
  if (error) return p3DbError(error)
  return NextResponse.json({ draft: { ...draft, sections, statuses, confirmed: confirmedList } })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const r = await load((await params).id, auth.user.id)
  if (!r.ok) return r.response
  const { error } = await r.supabase.from('health_programme_imports').delete().eq('id', r.draft.id).eq('user_id', auth.user.id)
  if (error) return p3DbError(error)
  return NextResponse.json({ deleted: true })
}
