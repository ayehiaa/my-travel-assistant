import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PROGRAMME_VIEWS, PROGRAMME_VIEW_LABELS, healthHref, type ProgrammeView } from '@/lib/health/healthHub'
import { nowFor, type ActiveEnrolment } from '@/lib/health/healthServer'
import { IMPORT_SECTIONS, sectionOf, type SectionKey, type SectionValue } from '@/lib/health/programmeImport'
import { P3MigrationNeeded, P3_MIGRATION_MESSAGE, latestPerLineage, loadImportDraft, loadIngredientCache, loadMealPlan, loadOpenDrafts, loadProgrammeRows } from '@/lib/health/p3Server'
import { addDays, weekStart } from '@/lib/health/time'
import HealthNotice from './HealthNotice'
import { ImportReview, ImportUpload } from './ProgrammeImport'
import { ProgrammeSectionEditor, ProgrammeSwitcher, VersionHistory } from './ProgrammeEditor'
import MealPlanWeek from './MealPlanWeek'
import { ClinicianExportForm, HealthDataRights } from './ExportAndData'

/** Programme tab sub-navigation (P3): Overview · Edit & versions · Import · Meal plan · Export & data. */
export function ProgrammeViewNav({ active }: { active: ProgrammeView }) {
  return (
    <nav aria-label="Programme sections" className="-mx-1 mb-4 overflow-x-auto">
      <ul className="flex w-max gap-1.5 px-1">
        {PROGRAMME_VIEWS.map(v => (
          <li key={v}>
            <Link
              href={healthHref({ tab: 'programme', view: v === 'overview' ? null : v })}
              aria-current={v === active ? 'page' : undefined}
              className={`inline-block whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold ${v === active ? 'border-[var(--blue-700)] bg-[var(--blue-700)] text-white' : 'border-[var(--rule)] bg-white text-[var(--ink-2)]'}`}
            >
              {PROGRAMME_VIEW_LABELS[v]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function P3Notice() {
  return (
    <HealthNotice title="This needs a database update">
      {P3_MIGRATION_MESSAGE.replace('This needs a database update — ', 'The owner must ')} to use import, editing, versions and the meal plan.
    </HealthNotice>
  )
}

function allSections(enrolment: ActiveEnrolment): Record<SectionKey, SectionValue> {
  const out = {} as Record<SectionKey, SectionValue>
  for (const s of IMPORT_SECTIONS) out[s.key] = sectionOf(enrolment.def, s.key)
  return out
}

export async function ProgrammeEditView({ userId, enrolment }: { userId: string; enrolment: ActiveEnrolment }) {
  const supabase = await createClient()
  let rows
  try {
    rows = await loadProgrammeRows(supabase, userId)
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return <P3Notice />
    return <HealthNotice title="Programmes are unavailable">Could not load your programmes — try again shortly.</HealthNotice>
  }
  const current = rows.find(r => r.id === enrolment.programmeId)
  const versions = current ? rows.filter(r => r.lineageId === current.lineageId).sort((a, b) => b.versionNo - a.versionNo) : []
  const programmes = latestPerLineage(rows)
  return (
    <div className="flex flex-col gap-4">
      <ProgrammeSectionEditor sections={allSections(enrolment)} />
      <VersionHistory versions={versions} currentId={enrolment.programmeId} />
      <ProgrammeSwitcher
        programmes={programmes}
        excludeIds={current ? programmes.filter(p => p.lineageId === current.lineageId).map(p => p.id) : [enrolment.programmeId]}
        today={nowFor(enrolment).date}
      />
    </div>
  )
}

export async function ProgrammeImportView({ userId, enrolment, importId }: { userId: string; enrolment: ActiveEnrolment; importId: string | undefined }) {
  const supabase = await createClient()
  const wantsDraft = !!importId && /^[0-9a-f-]{36}$/i.test(importId)
  let draft: Awaited<ReturnType<typeof loadImportDraft>> = null
  let drafts: Awaited<ReturnType<typeof loadOpenDrafts>> = []
  let failure: 'migration' | 'error' | null = null
  try {
    if (wantsDraft) draft = await loadImportDraft(supabase, userId, importId!)
    else drafts = await loadOpenDrafts(supabase, userId)
  } catch (err) {
    failure = err instanceof P3MigrationNeeded ? 'migration' : 'error'
  }
  if (failure === 'migration') return <P3Notice />
  if (failure === 'error') return <HealthNotice title="Import is unavailable">Could not load your imports — try again shortly.</HealthNotice>
  if (!wantsDraft) return <ImportUpload drafts={drafts} />
  if (!draft || draft.status !== 'draft') {
    return <HealthNotice title="Draft not found">This import was saved, discarded or does not exist. <Link className="underline" href={healthHref({ tab: 'programme', view: 'import' })}>Start a new import</Link>.</HealthNotice>
  }
  return (
    <ImportReview
      id={draft.id}
      fileName={draft.fileName}
      sections={draft.sections}
      statuses={draft.statuses}
      notes={draft.notes}
      confirmed={draft.confirmed}
      today={nowFor(enrolment).date}
      hasActive
    />
  )
}

export async function MealPlanView({ userId, enrolment, week }: { userId: string; enrolment: ActiveEnrolment; week: string }) {
  const supabase = await createClient()
  let plan
  try {
    plan = await loadMealPlan(supabase, userId, week)
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return <P3Notice />
    return <HealthNotice title="Meal plan is unavailable">Could not load the meal plan — try again shortly.</HealthNotice>
  }
  const aiCache = await loadIngredientCache(supabase, userId)
  return (
    <MealPlanWeek
      def={{ mealSlots: enrolment.def.mealSlots, mealRotation: enrolment.def.mealRotation }}
      week={week}
      prevWeek={addDays(week, -7)}
      nextWeek={addDays(week, 7)}
      today={nowFor(enrolment).date}
      initialChoices={plan.choices}
      initialChecked={plan.checked}
      aiCache={aiCache}
    />
  )
}

export function ExportView({ enrolment }: { enrolment: ActiveEnrolment }) {
  const today = nowFor(enrolment).date
  const from = enrolment.startDate < today ? enrolment.startDate : weekStart(today)
  return (
    <div className="flex flex-col gap-4">
      <ClinicianExportForm defaultFrom={from} defaultTo={today} />
      <HealthDataRights />
    </div>
  )
}
