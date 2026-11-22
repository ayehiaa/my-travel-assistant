import { getAiKeyStatus } from '@/lib/aiKeyStore'
import AiKeyCard from '@/components/portfolio/AiKeyCard'
import type { ActiveEnrolment } from '@/lib/health/healthServer'
import { nowFor } from '@/lib/health/healthServer'
import type { NutritionRule } from '@/lib/health/programmeSchema'
import { TARGET_KEYS, TARGET_LABELS, TargetOverridesSchema, computeTargets, type TargetKey } from '@/lib/health/targets'
import { programmeWeek } from '@/lib/health/time'
import { CARD } from './ui'
import { createClient } from '@/lib/supabase/server'
import { loadHealthSettings } from '@/lib/health/p2Server'
import { readEmailConfig } from '@/lib/notifications/config'
import HealthSettingsPanel from './HealthSettingsPanel'
import Link from 'next/link'
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

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className={`${CARD} group`} open={open}>
      <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-wide text-[var(--ink-3)]">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">›</span>{title}
      </summary>
      <div className="mt-3 text-sm text-[var(--ink-2)]">{children}</div>
    </details>
  )
}

/**
 * Programme (specs/029 §5): overview (targets with formulas, sections, settings, AI key) plus the P3 sub-views —
 * edit by section with version history, import from PDF/text, meal plan + shopping list, clinician export + data rights.
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
  let body: React.ReactNode
  if (view === 'edit') body = <ProgrammeEditView userId={props.userId} enrolment={props.enrolment} />
  else if (view === 'import') body = <ProgrammeImportView userId={props.userId} enrolment={props.enrolment} importId={props.importId} />
  else if (view === 'meals') body = <MealPlanView userId={props.userId} enrolment={props.enrolment} week={props.week ?? ''} />
  else if (view === 'export') body = <ExportView enrolment={props.enrolment} />
  else body = <ProgrammeOverview userId={props.userId} email={props.email} enrolment={props.enrolment} />
  return (
    <div>
      <ProgrammeViewNav active={view} />
      {body}
    </div>
  )
}

async function ProgrammeOverview({ userId, email, enrolment }: { userId: string; email: string; enrolment: ActiveEnrolment }) {
  const { def, targets } = enrolment
  const today = nowFor(enrolment).date
  const week = programmeWeek(enrolment.startDate, today)
  const overrides = TargetOverridesSchema.safeParse(enrolment.overrides)
  const formulas = enrolment.profile ? computeTargets(def, enrolment.profile, overrides.success ? overrides.data : {}).formulas : null
  const aiKey = await getAiKeyStatus(userId, email)
  const block = week !== null ? def.blocks.find(b => week >= b.weeks[0] && week <= b.weeks[1]) : null
  const { settings, available } = await loadHealthSettings(await createClient(), userId)
  const computed = enrolment.profile ? computeTargets(def, enrolment.profile, overrides.success ? overrides.data : {}).targets : null

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="text-lg font-bold text-[var(--ink)]">{enrolment.programmeName}</h2>
        <p className="text-sm text-[var(--ink-2)]">
          Started {new Date(`${enrolment.startDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          {week !== null && <> · week {Math.min(week, def.identity.durationWeeks)} of {def.identity.durationWeeks}</>}
          {block && <> · {block.name} ({block.focus})</>}
          {' '}· timezone {enrolment.homeTimezone}{enrolment.timezone !== enrolment.homeTimezone && <> (today: {enrolment.timezone})</>}
        </p>
        {def.identity.description && <p className="mt-2 text-sm text-[var(--ink-2)]">{def.identity.description}</p>}
        {def.identity.disclaimer && <p className="mt-2 text-xs text-[var(--ink-3)]">{def.identity.disclaimer}</p>}
      </section>

      <Section title="Daily targets" open>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {TARGET_KEYS.map(k => (
            <li key={k}>
              <span className="font-semibold text-[var(--ink)]">{TARGET_LABELS[k]}: {targets[k]} {UNITS[k]}</span>
              {formulas && <span className="block text-xs text-[var(--ink-3)]">{formulas[k]}</span>}
              {computed && computed[k] !== targets[k] && <span className="block text-xs text-blue-800">Adjusted from {computed[k]} {UNITS[k]} by an accepted fortnightly check.</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Components">
        <ul className="m-0 list-disc space-y-1 pl-5">
          {def.components.map(c => (
            <li key={c.key}>
              <strong className="text-[var(--ink)]">{c.name}</strong> {c.target} {c.unit} per {c.period}
              {c.timing === 'with_meal' && ' — with a meal'}
              {c.sources.length > 0 && <span className="text-xs text-[var(--ink-3)]"> (e.g. {c.sources.join(', ')})</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Meal slots & rules">
        <ul className="m-0 list-disc space-y-1 pl-5">
          {def.mealSlots.map(s => <li key={s.key}><strong className="text-[var(--ink)]">{s.name}</strong> {s.start}–{s.end}{s.template && ` — ${s.template}`}</li>)}
        </ul>
        <h3 className="mb-1 mt-3 font-semibold text-[var(--ink)]">Nutrition rules</h3>
        <ul className="m-0 list-disc space-y-1 pl-5">{def.nutritionRules.map(r => <li key={r.type}>{describeRule(r)}</li>)}</ul>
        {def.eatingOut.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 font-semibold text-[var(--ink)]">Eating out</h3>
            <ul className="m-0 list-disc space-y-1 pl-5">{def.eatingOut.map(t => <li key={t}>{t}</li>)}</ul>
          </>
        )}
      </Section>

      <Section title="Training">
        {def.weeklySchedule && (
          <ul className="m-0 mb-3 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
            {def.weeklySchedule.days.map(d => <li key={d.day}><span className="inline-block w-10 font-mono text-xs uppercase text-[var(--ink-3)]">{d.day}</span>{d.label}</li>)}
          </ul>
        )}
        {def.trainingSessions.map(s => (
          <div key={s.key} className="mb-3">
            <h3 className="font-semibold text-[var(--ink)]">{s.name} — {s.focus}</h3>
            <ul className="m-0 list-disc pl-5">
              {s.exercises.map(e => (
                <li key={e.key}>{e.name}{e.sets && ` · ${e.sets} × ${e.reps ?? `${e.holdSeconds}s`}`}{e.perSide && ' per side'}</li>
              ))}
            </ul>
          </div>
        ))}
        {def.blocks.length > 0 && (
          <ul className="m-0 list-disc space-y-1 pl-5">
            {def.blocks.map(b => <li key={b.key}><strong className="text-[var(--ink)]">{b.name}</strong> weeks {b.weeks[0]}–{b.weeks[1]}: {b.sets} sets, {b.repRange}{b.rir && `, RIR ${b.rir}`}{b.intensityTechnique && ` — ${b.intensityTechnique}`}</li>)}
          </ul>
        )}
        {def.movementRestrictions && def.movementRestrictions.excluded.length > 0 && (
          <p className="mt-2">Excluded movements: {def.movementRestrictions.excluded.join(', ')}.</p>
        )}
      </Section>

      <Section title="Cardio, sleep & supplements">
        {def.cardio && <p>Cardio: {def.cardio.sessionsPerWeek}× {def.cardio.minutes} min {def.cardio.intensity?.zone}{def.cardio.intensity?.bpmMin && ` (${def.cardio.intensity.bpmMin}–${def.cardio.intensity.bpmMax} bpm)`}. Avoid: {def.cardio.avoid.join(', ')}.</p>}
        {def.dailyMovement && <p className="mt-1">Steps: {def.dailyMovement.stepsMin.toLocaleString('en-GB')}{def.dailyMovement.stepsMax && `–${def.dailyMovement.stepsMax.toLocaleString('en-GB')}`} a day.</p>}
        {def.sleep && <p className="mt-1">Sleep: {def.sleep.durationHours?.join('–')} h, ±{def.sleep.consistencyMinutes} min{def.sleep.caffeineCutoff && `, no caffeine after ${def.sleep.caffeineCutoff}`}. {def.sleep.environment.join('; ')}.</p>}
        {def.supplements.map(s => <p key={s.key} className="mt-1">{s.name} {s.dose}{s.timing && ` — ${s.timing}`}. {s.notes} {s.caveats.join(' ')}</p>)}
      </Section>

      <Section title="Milestones & outcomes">
        <ul className="m-0 list-disc space-y-1 pl-5">
          {def.milestones.map(m => <li key={m.week}><strong className="text-[var(--ink)]">Week {m.week}</strong>: {m.tasks.join(', ')}{m.expected.length > 0 && ` — expected ${m.expected.join(', ')}`}</li>)}
        </ul>
        {def.outcomes?.expectations.map(e => <p key={e} className="mt-2">{e}</p>)}
        {def.outcomes?.escalation.map(e => <p key={e.metric} className="mt-1 text-xs text-[var(--ink-3)]">{e.note}</p>)}
      </Section>

      <HealthSettingsPanel initial={settings} available={available} emailConfigured={readEmailConfig(process.env).ok} />
      <p className="-mt-2 text-sm text-[var(--ink-2)]">
        <Link className="font-semibold text-[var(--blue-700)] underline" href={healthHref({ tab: 'programme', view: 'export' })}>Export or delete your health data →</Link>
      </p>

      <div>
        <p className="mb-2 text-sm text-[var(--ink-2)]">AI food estimates, programme import and the shopping-list split use your own Anthropic API key (a few cents per logged meal; text that matches your saved foods needs no AI).</p>
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
