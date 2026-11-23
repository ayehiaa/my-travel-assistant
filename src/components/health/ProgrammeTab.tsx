import { getAiKeyStatus } from '@/lib/aiKeyStore'
import AiKeyCard from '@/components/portfolio/AiKeyCard'
import type { ActiveEnrolment } from '@/lib/health/healthServer'
import { nowFor } from '@/lib/health/healthServer'
import type { NutritionRule } from '@/lib/health/programmeSchema'
import { TARGET_KEYS, TARGET_LABELS, TargetOverridesSchema, computeTargets, type TargetKey } from '@/lib/health/targets'
import { programmeEndDate, programmeWeek, programmeWeekLabel, weekdayOf } from '@/lib/health/time'
import { trainingPosition } from '@/lib/health/training'
import { effortText, phaseLabel, shortLabel, weekChip } from '@/lib/health/lifestyleUi'
import Chip from './ui/Chip'
import Disclosure from './ui/Disclosure'
import InfoPopover from './ui/InfoPopover'
import ListRow, { ListGroup } from './ui/ListRow'
import StatTile from './ui/StatTile'
import { createClient } from '@/lib/supabase/server'
import { loadHealthSettings } from '@/lib/health/p2Server'
import { readEmailConfig } from '@/lib/notifications/config'
import HealthSettingsPanel from './HealthSettingsPanel'
import { healthHref, type ProgrammeView } from '@/lib/health/healthHub'
import { ExportView, MealPlanView, ProgrammeEditView, ProgrammeImportView, ProgrammeViewNav } from './ProgrammeViews'

const UNITS: Record<TargetKey, string> = { kcal: 'kcal', proteinG: 'g', fatG: 'g', satFatTargetG: 'g', satFatCeilingG: 'g', carbsG: 'g', fibreMinG: 'g' }

function describeRule(r: NutritionRule): string {
  switch (r.type) {
    case 'one_starch_per_meal': return `One starch serving per meal (max ${r.maxStarchServings})`
    case 'protein_every_occasion': return `Protein in every eating occasion (≥${r.minProteinG} g)`
    case 'treat_budget': return `Treats (≥${r.minKcal} kcal) use spare saturated fat; pay the calories by dropping starch`
    case 'caffeine_cutoff': return `No caffeine after ${r.time}`
    case 'last_meal_before_bed': return `Last meal at least ${r.minGapHours} h before bed`
  }
}

function Details({ title, children, meta }: { title: string; children: React.ReactNode; meta?: string }) {
  return <Disclosure title={title} meta={meta}><div className="text-sm text-[var(--ink-2)]">{children}</div></Disclosure>
}

/**
 * Plan (was "Programme"; specs/029 §5, redesigned in specs/032): plain overview (targets, week, phase, end date), then
 * list rows to the sub-pages — meal plan, edit & versions, import, settings, export & data — and details on demand.
 */
export default async function ProgrammeTab(props: {
  userId: string
  email: string
  enrolment: ActiveEnrolment
  view?: ProgrammeView
  week?: string
  importId?: string
}) {
  const view = props.view ?? 'overview'
  if (view === 'overview') return <ProgrammeOverview enrolment={props.enrolment} />
  let body: React.ReactNode
  if (view === 'edit') body = <ProgrammeEditView userId={props.userId} enrolment={props.enrolment} />
  else if (view === 'import') body = <ProgrammeImportView userId={props.userId} enrolment={props.enrolment} importId={props.importId} />
  else if (view === 'meals') body = <MealPlanView userId={props.userId} enrolment={props.enrolment} week={props.week ?? ''} />
  else if (view === 'export') body = <ExportView enrolment={props.enrolment} />
  else body = <SettingsView userId={props.userId} email={props.email} />
  return (
    <div>
      <ProgrammeViewNav active={view} />
      {body}
    </div>
  )
}

async function SettingsView({ userId, email }: { userId: string; email: string }) {
  const [aiKey, { settings, available }] = await Promise.all([getAiKeyStatus(userId, email), loadHealthSettings(await createClient(), userId)])
  return (
    <div className="flex flex-col gap-4">
      <HealthSettingsPanel initial={settings} available={available} emailConfigured={readEmailConfig(process.env).ok} />
      <div>
        <div className="mb-1 flex items-center gap-1">
          <h2 className="text-sm font-bold text-[var(--ink)]">AI key</h2>
          <InfoPopover label="About the AI key" align="left">Food estimates, programme import and the shopping-list split use your own Anthropic API key (a few cents per meal; text matching your saved foods needs no AI).</InfoPopover>
        </div>
        <AiKeyCard
          migrationApplied={aiKey.migrationApplied}
          initialConnected={aiKey.connected}
          initialProvider={aiKey.provider}
          initialLast4={aiKey.last4}
          initialCreatedAt={aiKey.createdAt}
          usingOwnerFallback={aiKey.usingOwnerFallback}
        />
      </div>
    </div>
  )
}

export interface PlanOverviewModel {
  name: string
  chip: string
  startText: string
  endText: string
  about: string[]
  targets: Array<{ key: string; label: string; value: string; sub?: string | null }>
  targetNotes: string[]
  schedule: Array<{ day: string; label: string; full: string; isToday: boolean }>
  details: {
    components: Array<{ key: string; text: string; sources: string }>
    slots: string[]
    rules: string[]
    eatingOut: string[]
    sessions: Array<{ key: string; title: string; exercises: string[] }>
    phases: string[]
    excluded: string[]
    cardio: string[]
    supplements: string[]
    milestones: string[]
    outcomes: string[]
  }
}

export function ProgrammeOverview({ enrolment }: { enrolment: ActiveEnrolment }) {
  const { def, targets } = enrolment
  const today = nowFor(enrolment).date
  const week = programmeWeek(enrolment.startDate, today)
  const overrides = TargetOverridesSchema.safeParse(enrolment.overrides)
  const calc = enrolment.profile ? computeTargets(def, enrolment.profile, overrides.success ? overrides.data : {}) : null
  const pos = trainingPosition(def, enrolment.startDate, today)
  const blockIndex = pos.block ? def.blocks.findIndex(b => b.key === pos.block!.key) : -1
  const endDate = programmeEndDate(enrolment.startDate, def.identity.durationWeeks)
  const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const todayDay = weekdayOf(today)

  const model: PlanOverviewModel = {
    name: enrolment.programmeName,
    chip: [pos.block ? phaseLabel(pos.block.name, blockIndex) : null, weekChip(enrolment.startDate, today, def.identity.durationWeeks)].filter(Boolean).join(' · '),
    startText: `${week === null ? 'Starts' : 'Started'} ${longDate(enrolment.startDate)}`,
    endText: `Ends ${longDate(endDate)}`,
    about: [
      ...(week !== null ? [programmeWeekLabel(enrolment.startDate, today, def.identity.durationWeeks) ?? 'Programme complete'] : []),
      `Timezone ${enrolment.homeTimezone}${enrolment.timezone !== enrolment.homeTimezone ? ` (today: ${enrolment.timezone})` : ''}`,
      ...(def.identity.description ? [def.identity.description] : []),
      ...(def.identity.disclaimer ? [def.identity.disclaimer] : []),
    ],
    targets: [
      { key: 'kcal', label: 'Calories', value: `${targets.kcal}`, sub: 'kcal' },
      { key: 'proteinG', label: 'Protein', value: `${targets.proteinG} g`, sub: 'at least' },
      { key: 'satFat', label: 'Sat fat', value: `${targets.satFatTargetG} g`, sub: `limit ${targets.satFatCeilingG} g` },
      { key: 'fatG', label: 'Fat', value: `${targets.fatG} g` },
      { key: 'carbsG', label: 'Carbs', value: `${targets.carbsG} g` },
      { key: 'fibreMinG', label: 'Fibre', value: `${targets.fibreMinG} g`, sub: 'at least' },
    ],
    targetNotes: TARGET_KEYS.flatMap(k => [
      ...(calc?.formulas ? [`${TARGET_LABELS[k]}: ${calc.formulas[k]}`] : []),
      ...(calc && calc.targets[k] !== targets[k] ? [`${TARGET_LABELS[k]} adjusted from ${calc.targets[k]} ${UNITS[k]} by a calorie check.`] : []),
    ]),
    schedule: (def.weeklySchedule?.days ?? []).map(d => ({ day: d.day, label: shortLabel(d.label), full: d.label, isToday: d.day === todayDay })),
    details: {
      components: def.components.map(c => ({
        key: c.key,
        text: `${c.name}: ${c.target} ${c.unit} a ${c.period}${c.timing === 'with_meal' ? ', with a meal' : ''}`,
        sources: c.sources.join(', '),
      })),
      slots: def.mealSlots.map(m => `${m.name} ${m.start}–${m.end}${m.template ? ` — ${m.template}` : ''}`),
      rules: def.nutritionRules.map(describeRule),
      eatingOut: def.eatingOut,
      sessions: def.trainingSessions.map(t => ({
        key: t.key,
        title: `${t.name} — ${t.focus}`,
        exercises: t.exercises.map(e => `${e.name}${e.sets ? ` · ${e.sets} × ${e.reps ?? `${e.holdSeconds}s`}` : ''}${e.perSide ? ' / side' : ''}`),
      })),
      phases: def.blocks.map((b, i) => `${phaseLabel(b.name, i)} (weeks ${b.weeks[0]}–${b.weeks[1]}): ${b.sets} sets, ${b.repRange} reps${b.rir ? `, ${effortText(b.rir)}` : ''}${b.intensityTechnique ? ` — ${b.intensityTechnique}` : ''}`),
      excluded: def.movementRestrictions?.excluded ?? [],
      cardio: [
        ...(def.cardio ? [`Cardio: ${def.cardio.sessionsPerWeek} × ${def.cardio.minutes} min ${def.cardio.intensity?.zone ?? ''}${def.cardio.intensity?.bpmMin ? ` (${def.cardio.intensity.bpmMin}–${def.cardio.intensity.bpmMax} bpm)` : ''}`, `Avoid: ${def.cardio.avoid.join(', ')}`] : []),
        ...(def.dailyMovement ? [`Steps: ${def.dailyMovement.stepsMin.toLocaleString('en-GB')}${def.dailyMovement.stepsMax ? `–${def.dailyMovement.stepsMax.toLocaleString('en-GB')}` : ''} a day`] : []),
        ...(def.sleep ? [`Sleep: ${def.sleep.durationHours?.join('–')} h, ±${def.sleep.consistencyMinutes} min${def.sleep.caffeineCutoff ? `, no caffeine after ${def.sleep.caffeineCutoff}` : ''}`, ...def.sleep.environment] : []),
      ],
      supplements: def.supplements.map(x => `${x.name} ${x.dose}${x.timing ? ` — ${x.timing}` : ''}. ${x.notes ?? ''} ${x.caveats.join(' ')}`.trim()),
      milestones: def.milestones.map(x => `Week ${x.week}: ${x.tasks.join(', ')}${x.expected.length ? ` — expected ${x.expected.join(', ')}` : ''}`),
      outcomes: [...(def.outcomes?.expectations ?? []), ...(def.outcomes?.escalation.map(e => e.note) ?? [])],
    },
  }
  return <PlanOverview m={model} />
}

/** Presentational Plan overview (also used by the dev preview). */
export function PlanOverview({ m }: { m: PlanOverviewModel }) {
  const d = m.details
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-[var(--rule)] bg-white p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-[var(--ink)]">{m.name}</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">{m.startText} · {m.endText}</p>
          </div>
          <InfoPopover label="About this plan"><ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">{m.about.map(a => <li key={a}>{a}</li>)}</ul></InfoPopover>
        </div>
        <div className="mt-2"><Chip>{m.chip}</Chip></div>
      </section>

      <section aria-labelledby="tg-h">
        <div className="mb-1 flex items-center gap-1">
          <h2 id="tg-h" className="text-sm font-bold text-[var(--ink)]">Daily targets</h2>
          {m.targetNotes.length > 0 && <InfoPopover label="How targets are set" align="left"><ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">{m.targetNotes.map(t => <li key={t}>{t}</li>)}</ul></InfoPopover>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {m.targets.map(t => <StatTile key={t.key} label={t.label} value={t.value} sub={t.sub} />)}
        </div>
      </section>

      {m.schedule.length > 0 && (
        <section aria-labelledby="wk-h" className="rounded-xl border border-[var(--rule)] bg-white px-4 py-3">
          <h2 id="wk-h" className="mb-1 text-sm font-bold text-[var(--ink)]">Week</h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {m.schedule.map(s => (
              <li key={s.day} title={s.full} className={`flex min-h-9 items-center gap-3 text-sm ${s.isToday ? 'font-bold text-[var(--blue-700)]' : 'text-[var(--ink-2)]'}`}>
                <span className="w-9 shrink-0 font-mono text-xs uppercase text-[var(--ink-3)]">{s.day}</span>
                <span className="min-w-0 truncate">{s.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ListGroup title="Manage">
        <ListRow href={healthHref({ tab: 'plan', view: 'meals' })} icon="🍽" title="Meal plan" meta="Swaps & shopping list" />
        <ListRow href={healthHref({ tab: 'plan', view: 'edit' })} icon="✎" title="Edit plan" meta="Sections & versions" />
        <ListRow href={healthHref({ tab: 'plan', view: 'import' })} icon="⤒" title="Import" meta="From a PDF or text" />
        <ListRow href={healthHref({ tab: 'plan', view: 'settings' })} icon="⚙" title="Settings" meta="Reminders, units, AI key" />
        <ListRow href={healthHref({ tab: 'plan', view: 'export' })} icon="⇩" title="Export & data" meta="Clinician PDF, download, delete" />
      </ListGroup>

      <div className="flex flex-col gap-2">
        <h2 className="mt-1 text-sm font-bold text-[var(--ink)]">Details</h2>
        <Details title="Food goals" meta={`${d.components.length}`}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{d.components.map(c => <li key={c.key}><strong className="text-[var(--ink)]">{c.text}</strong>{c.sources && <span className="block text-xs text-[var(--ink-3)]">e.g. {c.sources}</span>}</li>)}</ul>
        </Details>
        <Details title="Meals & rules">
          <ul className="m-0 list-disc space-y-1 pl-5">{d.slots.map(x => <li key={x}>{x}</li>)}</ul>
          <h3 className="mb-1 mt-3 font-semibold text-[var(--ink)]">Rules</h3>
          <ul className="m-0 list-disc space-y-1 pl-5">{d.rules.map(x => <li key={x}>{x}</li>)}</ul>
          {d.eatingOut.length > 0 && <><h3 className="mb-1 mt-3 font-semibold text-[var(--ink)]">Eating out</h3><ul className="m-0 list-disc space-y-1 pl-5">{d.eatingOut.map(x => <li key={x}>{x}</li>)}</ul></>}
        </Details>
        <Details title="Training">
          {d.sessions.map(s => (
            <div key={s.key} className="mb-3">
              <h3 className="font-semibold text-[var(--ink)]">{s.title}</h3>
              <ul className="m-0 list-disc pl-5">{s.exercises.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
          {d.phases.length > 0 && <ul className="m-0 list-disc space-y-1 pl-5">{d.phases.map(x => <li key={x}>{x}</li>)}</ul>}
          {d.excluded.length > 0 && <p className="mt-2">Excluded movements: {d.excluded.join(', ')}.</p>}
        </Details>
        <Details title="Cardio, sleep & supplements">
          <ul className="m-0 list-disc space-y-1 pl-5">{[...d.cardio, ...d.supplements].map(x => <li key={x}>{x}</li>)}</ul>
        </Details>
        <Details title="Milestones & outcomes">
          <ul className="m-0 list-disc space-y-1 pl-5">{d.milestones.map(x => <li key={x}>{x}</li>)}</ul>
          {d.outcomes.map(x => <p key={x} className="mt-2 text-xs">{x}</p>)}
        </Details>
      </div>
    </div>
  )
}
