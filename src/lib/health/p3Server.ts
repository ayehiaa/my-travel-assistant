import { NextResponse } from 'next/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import { logAudit } from '@/lib/auditLogger'
import type { AuditAction } from '@/types/database'
import type { ActiveEnrolment, ServerClient } from './healthServer'
import { parseProgrammeDefinition, type ProgrammeDefinition } from './programmeSchema'
import { IMPORT_SECTIONS, type DraftSections, type SectionKey, type SectionStatus } from './programmeImport'
import { MealPlanChoicesSchema, type Ingredient, type MealPlanChoices } from './mealPlan'

/**
 * Server-only data access for Health phase P3 (programme import drafts + versions, enrolment switch, meal plans,
 * ingredient cache). Session client → owner-only RLS applies. A missing P3 table / column maps to a friendly
 * "needs a database update" (503) instead of a crash.
 */

export const P3_MIGRATION_MESSAGE = 'This needs a database update — apply supabase/apply_health_p3.sql'

export class P3MigrationNeeded extends Error {
  constructor() { super(P3_MIGRATION_MESSAGE) }
}

export function p3DbError(error: { code?: string; message?: string } | null): NextResponse {
  return isMissingSchemaError(error)
    ? NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    : NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

/** Audit without content (best effort — never fails the request). */
export async function auditHealth(userId: string, action: AuditAction, fields: Record<string, { before: unknown; after: unknown }>): Promise<void> {
  try {
    await logAudit({ performedBy: userId, action, tripId: null, changedFields: fields })
  } catch {
    // best effort
  }
}

// ── Import drafts ───────────────────────────────────────────────────────────

export interface ImportDraft {
  id: string
  status: 'draft' | 'saved' | 'discarded'
  sourceKind: 'pdf' | 'text'
  fileName: string | null
  sections: DraftSections
  statuses: Record<SectionKey, SectionStatus>
  notes: Partial<Record<SectionKey, string>>
  confirmed: SectionKey[]
  programmeId: string | null
  createdAt: string
  updatedAt: string
}

export function rowToDraft(r: Record<string, unknown>): ImportDraft {
  const sections = (r.sections && typeof r.sections === 'object' ? r.sections : {}) as Record<string, Record<string, unknown>>
  const statuses = (r.statuses && typeof r.statuses === 'object' ? r.statuses : {}) as Record<string, SectionStatus>
  const fullSections = {} as DraftSections
  const fullStatuses = {} as Record<SectionKey, SectionStatus>
  for (const s of IMPORT_SECTIONS) {
    fullSections[s.key] = sections[s.key] && typeof sections[s.key] === 'object' ? sections[s.key] : {}
    fullStatuses[s.key] = ['extracted', 'needs_review', 'not_found'].includes(statuses[s.key]) ? statuses[s.key] : 'not_found'
  }
  return {
    id: String(r.id),
    status: (r.status as ImportDraft['status']) ?? 'draft',
    sourceKind: r.source_kind === 'pdf' ? 'pdf' : 'text',
    fileName: (r.file_name as string | null) ?? null,
    sections: fullSections,
    statuses: fullStatuses,
    notes: (r.notes && typeof r.notes === 'object' ? r.notes : {}) as ImportDraft['notes'],
    confirmed: (Array.isArray(r.confirmed) ? r.confirmed : []).filter((k): k is SectionKey => IMPORT_SECTIONS.some(s => s.key === k)),
    programmeId: (r.programme_id as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export async function loadImportDraft(supabase: ServerClient, userId: string, id: string): Promise<ImportDraft | null> {
  const { data, error } = await supabase.from('health_programme_imports').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) throw new P3MigrationNeeded()
    throw new Error('Could not load the import')
  }
  return data ? rowToDraft(data as Record<string, unknown>) : null
}

export async function loadOpenDrafts(supabase: ServerClient, userId: string): Promise<Array<Pick<ImportDraft, 'id' | 'fileName' | 'sourceKind' | 'createdAt' | 'confirmed'>>> {
  const { data, error } = await supabase
    .from('health_programme_imports')
    .select('id, file_name, source_kind, created_at, confirmed')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) {
    if (isMissingSchemaError(error)) throw new P3MigrationNeeded()
    throw new Error('Could not load imports')
  }
  return (data ?? []).map(r => ({
    id: String(r.id),
    fileName: (r.file_name as string | null) ?? null,
    sourceKind: r.source_kind === 'pdf' ? 'pdf' as const : 'text' as const,
    createdAt: String(r.created_at),
    confirmed: (Array.isArray(r.confirmed) ? r.confirmed : []) as SectionKey[],
  }))
}

// ── Programmes + versions ───────────────────────────────────────────────────

export interface ProgrammeVersion {
  id: string
  lineageId: string
  versionNo: number
  name: string
  source: 'template' | 'import' | 'edit'
  changeSummary: string[]
  createdAt: string
  templateKey: string | null
}

function rowToVersion(r: Record<string, unknown>): ProgrammeVersion {
  const summary = Array.isArray(r.change_summary) ? (r.change_summary as unknown[]).filter((s): s is string => typeof s === 'string') : []
  return {
    id: String(r.id),
    lineageId: String(r.lineage_id ?? r.id),
    versionNo: Number(r.version_no ?? 1) || 1,
    name: String(r.name ?? 'Programme'),
    source: r.source === 'import' || r.source === 'edit' ? r.source : 'template',
    changeSummary: summary,
    createdAt: String(r.created_at),
    templateKey: (r.template_key as string | null) ?? null,
  }
}

/** Every programme row the user owns (all versions), newest first. Throws P3MigrationNeeded without the P3 columns. */
export async function loadProgrammeRows(supabase: ServerClient, userId: string): Promise<ProgrammeVersion[]> {
  const { data, error } = await supabase
    .from('health_programmes')
    .select('id, lineage_id, version_no, name, source, change_summary, created_at, template_key')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    if (isMissingSchemaError(error)) throw new P3MigrationNeeded()
    throw new Error('Could not load programmes')
  }
  return (data ?? []).map(r => rowToVersion(r as Record<string, unknown>))
}

/** Latest version per lineage (the programmes the user can switch to). */
export function latestPerLineage(rows: readonly ProgrammeVersion[]): ProgrammeVersion[] {
  const out = new Map<string, ProgrammeVersion>()
  for (const r of rows) {
    const cur = out.get(r.lineageId)
    if (!cur || r.versionNo > cur.versionNo) out.set(r.lineageId, r)
  }
  return [...out.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function loadProgrammeDefinition(supabase: ServerClient, userId: string, id: string): Promise<{ row: ProgrammeVersion; def: ProgrammeDefinition } | null> {
  const { data, error } = await supabase
    .from('health_programmes')
    .select('id, lineage_id, version_no, name, source, change_summary, created_at, template_key, definition')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) throw new P3MigrationNeeded()
    throw new Error('Could not load the programme')
  }
  if (!data) return null
  const def = parseProgrammeDefinition((data as Record<string, unknown>).definition)
  return def ? { row: rowToVersion(data as Record<string, unknown>), def } : null
}

/** Insert a new programme row (import → new lineage; edit → next version of a lineage). */
export async function insertProgramme(supabase: ServerClient, userId: string, p: {
  def: ProgrammeDefinition
  source: 'import' | 'edit'
  lineageId?: string | null
  parentId?: string | null
  versionNo?: number
  changeSummary?: string[] | null
  templateKey?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: { code?: string; message?: string } }> {
  const { data, error } = await supabase
    .from('health_programmes')
    .insert({
      user_id: userId,
      template_key: p.templateKey ?? null,
      name: p.def.identity.name,
      version: p.def.identity.version,
      definition: p.def,
      source: p.source,
      lineage_id: p.lineageId ?? null,
      parent_id: p.parentId ?? null,
      version_no: p.versionNo ?? 1,
      change_summary: p.changeSummary ?? null,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error ?? { message: 'no row' } }
  const id = String(data.id)
  if (!p.lineageId) await supabase.from('health_programmes').update({ lineage_id: id }).eq('id', id).eq('user_id', userId)
  return { ok: true, id }
}

/**
 * End the current enrolment (status completed — its history stays) and start a new active one. On failure the old
 * enrolment is restored to active so the user is never left without a programme.
 */
export async function switchEnrolment(supabase: ServerClient, userId: string, current: ActiveEnrolment | null, next: {
  programmeId: string
  startDate: string
  timezone: string
  profile: unknown
  targets: unknown
}): Promise<{ ok: true; id: string } | { ok: false; error: { code?: string; message?: string } }> {
  const now = new Date().toISOString()
  if (current) {
    const end = await supabase.from('health_enrolments').update({ status: 'completed', updated_at: now }).eq('id', current.id).eq('user_id', userId)
    if (end.error) return { ok: false, error: end.error }
  }
  const { data, error } = await supabase
    .from('health_enrolments')
    .insert({
      user_id: userId,
      programme_id: next.programmeId,
      start_date: next.startDate,
      timezone: next.timezone,
      profile: next.profile,
      overrides: {},
      effective_targets: next.targets,
      status: 'active',
    })
    .select('id')
    .single()
  if (error || !data) {
    if (current) await supabase.from('health_enrolments').update({ status: 'active', updated_at: now }).eq('id', current.id).eq('user_id', userId)
    return { ok: false, error: error ?? { message: 'no row' } }
  }
  return { ok: true, id: String(data.id) }
}

// ── Meal plans + ingredient cache ───────────────────────────────────────────

export interface StoredMealPlan { choices: MealPlanChoices; checked: string[] }

export async function loadMealPlan(supabase: ServerClient, userId: string, weekStartDate: string): Promise<StoredMealPlan> {
  const { data, error } = await supabase.from('health_meal_plans').select('choices, checked').eq('user_id', userId).eq('week_start', weekStartDate).maybeSingle()
  if (error) {
    if (isMissingSchemaError(error)) throw new P3MigrationNeeded()
    throw new Error('Could not load the meal plan')
  }
  const choices = MealPlanChoicesSchema.safeParse(data?.choices ?? {})
  return {
    choices: choices.success ? choices.data : {},
    checked: Array.isArray(data?.checked) ? (data.checked as unknown[]).filter((s): s is string => typeof s === 'string') : [],
  }
}

export async function loadIngredientCache(supabase: ServerClient, userId: string): Promise<Record<string, Ingredient[]>> {
  try {
    const { data, error } = await supabase.from('health_ingredient_cache').select('part_key, ingredients').eq('user_id', userId).limit(1000)
    if (error || !data) return {}
    const out: Record<string, Ingredient[]> = {}
    for (const r of data) if (Array.isArray(r.ingredients)) out[String(r.part_key)] = r.ingredients as Ingredient[]
    return out
  } catch {
    return {}
  }
}
