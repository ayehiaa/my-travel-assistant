import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { ActiveEnrolment } from '@/lib/health/healthServer'
import { healthHref } from '@/lib/health/healthHub'
import { addDays, isValidDate } from '@/lib/health/time'
import {
  displayName, findExercise, formatLoggedSet, orderWarning, progressionSuggestion, spacingWarning, suggestedStartLoad,
  topSetSeries, trainingPosition, unlockHostSession, usesDumbbells, weekSchedule, youtubeSearchUrl,
  blockForWeek, type LoggedSet, type ProgressionSuggestion, type TrainingPosition, type TrainingSession,
} from '@/lib/health/training'
import { evaluateJointCheck, exerciseSafety, outcomeLabel } from '@/lib/health/painRules'
import {
  loadExerciseHistory, loadTrainingContext, loadWorkouts, prescriptionFor, TRAINING_MIGRATION_MESSAGE,
  type TrainingContext,
} from '@/lib/health/trainingServer'
import LineChart from '@/components/portfolio/hub/LineChart'
import { loadTripRanges } from '@/lib/health/p2Server'
import { tripOn } from '@/lib/health/travel'
import ActivitySection from './ActivitySection'
import HealthNotice from './HealthNotice'
import SessionPlayer, { type PlayerExercise } from './SessionPlayer'
import { ApprovalToggle, DeleteWorkoutButton, JointClearanceButton } from './TrainingActions'
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from './ui'

const BACKDATE_DAYS = 60

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function weekBanner(enrolment: ActiveEnrolment, position: TrainingPosition): string {
  const def = enrolment.def
  if (position.phase === 'before_start') return `Programme starts ${fmtDay(enrolment.startDate)} — sessions use the table as written until then`
  if (position.phase === 'completed') return `${def.identity.name} complete — sessions use the table as written`
  const parts = [`Week ${position.week} of ${def.identity.durationWeeks}`]
  if (position.block) parts.push(position.block.name)
  if (position.light) parts.push('light week')
  if (position.deload) parts.push('deload week')
  return parts.join(' · ')
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  done:     { label: 'Done', cls: 'bg-green-100 text-green-800' },
  partial:  { label: 'Partial', cls: 'bg-amber-100 text-amber-900' },
  skipped:  { label: 'Skipped', cls: 'bg-gray-200 text-gray-800' },
  moved:    { label: 'Done another day', cls: 'bg-green-50 text-green-800' },
  missed:   { label: 'Missed', cls: 'bg-red-100 text-red-800' },
  today:    { label: 'Today', cls: 'bg-blue-100 text-blue-800' },
  upcoming: { label: 'Planned', cls: 'bg-[var(--paper-2)] text-[var(--ink-3)]' },
}

function sessionName(enrolment: ActiveEnrolment, key: string): string {
  return enrolment.def.trainingSessions.find(s => s.key === key)?.name ?? key.toUpperCase()
}

/** Training (specs/029 US5/US6): overview, guided session player (?session=) and exercise history (?exercise=). */
export default async function TrainingTab({ userId, enrolment, session, exercise, date, travel }: {
  userId: string
  enrolment: ActiveEnrolment
  session?: string
  exercise?: string
  date?: string
  /** ?travel=1 from Today's travel mode. */
  travel?: boolean
}) {
  const supabase = await createClient()
  const loaded = await loadTrainingContext(supabase, userId, enrolment)
  if (loaded.status === 'migration_needed') {
    return <HealthNotice title="Training needs a database update">{TRAINING_MIGRATION_MESSAGE.replace('Training needs a database update — ', 'The owner must ')} in Supabase before sessions can be saved.</HealthNotice>
  }
  if (loaded.status === 'error') return <HealthNotice title="Could not load training">Try again shortly.</HealthNotice>
  const { ctx } = loaded

  if (exercise) return <ExerciseHistory userId={userId} enrolment={enrolment} exerciseKey={exercise} />
  const s = session ? enrolment.def.trainingSessions.find(t => t.key === session) : undefined
  if (s) {
    const d = date && isValidDate(date) && date <= ctx.today && date >= addDays(ctx.today, -BACKDATE_DAYS) ? date : ctx.today
    return <PlayerLoader userId={userId} enrolment={enrolment} ctx={ctx} session={s} date={d} travel={travel === true} />
  }
  return <Overview userId={userId} enrolment={enrolment} ctx={ctx} />
}

// ── Overview ────────────────────────────────────────────────────────────────

async function Overview({ userId, enrolment, ctx }: { userId: string; enrolment: ActiveEnrolment; ctx: TrainingContext }) {
  const def = enrolment.def
  const supabase = await createClient()
  let recent: Awaited<ReturnType<typeof loadWorkouts>> = []
  try { recent = await loadWorkouts(supabase, userId, addDays(ctx.today, -27), ctx.today) } catch { recent = [] }
  const week = weekSchedule(def, ctx.today, ctx.weekWorkouts)
  const rec = ctx.recommendation
  const block = ctx.position.block
  const rules = def.painRules
  const latest = ctx.joint.basis

  return (
    <div className="flex flex-col gap-4">
      <section className={`${CARD} bg-[var(--paper-2)]`} aria-labelledby="blk-h">
        <h2 id="blk-h" className="text-lg font-bold text-[var(--ink)]">{weekBanner(enrolment, ctx.position)}</h2>
        {block && (
          <p className="mt-1 text-sm text-[var(--ink-2)]">
            {block.focus} · {block.repRange} reps{block.rir && <> · RIR {block.rir}</>}
            {block.intensityTechnique && <span className="block text-xs text-[var(--ink-3)]">{block.intensityTechnique}</span>}
          </p>
        )}
      </section>

      {ctx.joint.level !== 'ok' && (
        <section className={`${CARD} ${ctx.joint.level === 'stop' ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`} role="alert">
          <h2 className={`mb-1 text-base font-bold ${ctx.joint.level === 'stop' ? 'text-red-900' : 'text-amber-900'}`}>
            {ctx.joint.level === 'stop' ? 'Leg work paused — red flag' : 'Joint check: go easier next session'}
          </h2>
          <p className={`text-sm ${ctx.joint.level === 'stop' ? 'text-red-900' : 'text-amber-900'}`}>{ctx.joint.message}</p>
          {ctx.joint.uncleared?.id && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-red-900">Recorded {fmtDay(ctx.joint.uncleared.date)}: {ctx.joint.uncleared.redFlags.join(', ')}.</p>
              <JointClearanceButton checkId={ctx.joint.uncleared.id} />
            </div>
          )}
        </section>
      )}

      <section className={CARD} aria-labelledby="today-tr-h">
        <h2 id="today-tr-h" className={CARD_TITLE}>Today</h2>
        <p className="text-sm text-[var(--ink)]">{rec.reason}</p>
        {rec.warnings.map(w => <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rec.sessionKey && (
            <Link href={healthHref({ tab: 'training', session: rec.sessionKey })} className={BUTTON_PRIMARY}>
              Start {sessionName(enrolment, rec.sessionKey)}
            </Link>
          )}
          <span className="text-xs text-[var(--ink-3)]">Or open:</span>
          {def.trainingSessions.map(t => (
            <Link key={t.key} href={healthHref({ tab: 'training', session: t.key })} className="text-sm font-semibold text-[var(--blue-700)] underline">{t.name}</Link>
          ))}
        </div>
      </section>

      <section className={CARD} aria-labelledby="wk-h">
        <h2 id="wk-h" className={CARD_TITLE}>This week</h2>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {week.map(d => {
            const chip = d.status ? STATUS_CHIP[d.status] : null
            return (
              <li key={d.date} className={`flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule-soft)] pb-2 text-sm last:border-0 ${d.date === ctx.today ? 'font-semibold' : ''}`}>
                <span className="min-w-0">
                  <span className="mr-2 inline-block w-24 font-mono text-xs text-[var(--ink-3)]">{fmtDay(d.date)}</span>
                  <span className="text-[var(--ink)]">{d.label}</span>
                  {d.workouts.filter(w => w.sessionKey !== d.sessionKey).map(w => (
                    <span key={w.sessionKey} className="ml-2 text-xs text-[var(--ink-3)]">({sessionName(enrolment, w.sessionKey)} {w.status})</span>
                  ))}
                </span>
                {chip && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${chip.cls}`}>{chip.label}</span>}
              </li>
            )
          })}
        </ol>
        {(def.weeklySchedule?.spacingRules.length ?? 0) > 0 && (
          <ul className="mt-3 list-disc pl-5 text-xs text-[var(--ink-3)]">
            {def.weeklySchedule!.spacingRules.map(r => <li key={r}>{r}</li>)}
          </ul>
        )}
      </section>

      {(rules || ctx.unlocks.length > 0) && (
        <section className={CARD} aria-labelledby="jt-h">
          <h2 id="jt-h" className={CARD_TITLE}>Joint & unlocks</h2>
          {rules && (
            <p className="text-sm text-[var(--ink-2)]">
              Latest joint check: {latest ? <>{fmtDay(latest.date)} — <strong className="text-[var(--ink)]">{outcomeLabel(evaluateJointCheck(rules, latest))}</strong>
                {latest.duringPain !== null && <> · {latest.duringPain}/10 during</>}
                {latest.nextMorningPain !== null && <> · {latest.nextMorningPain}/10 next morning</>}</> : 'none yet'}
            </p>
          )}
          {ctx.unlocks.length > 0 && (
            <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
              {ctx.unlocks.map(u => (
                <li key={u.key} className="rounded-lg border border-[var(--rule)] p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-sm text-[var(--ink)]">{u.exercise?.name ?? u.movement}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${u.available ? 'bg-green-100 text-green-800' : 'bg-[var(--paper-2)] text-[var(--ink-3)]'}`}>
                      {u.available ? `Unlocked — in ${sessionName(enrolment, unlockHostSession(def) ?? '')}` : 'Locked'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-2)]">{u.reason}</p>
                  {u.notes && <p className="mt-1 text-xs text-[var(--ink-3)]">{u.notes}</p>}
                  {u.requires === 'professional_approval' && (
                    <ApprovalToggle unlockKey={u.key} approved={ctx.approvals.includes(u.key)} movement={u.movement} />
                  )}
                </li>
              ))}
            </ul>
          )}
          {(def.movementRestrictions?.excluded.length ?? 0) > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-3)]">Never offered: {def.movementRestrictions!.excluded.join(', ').toLowerCase()}.</p>
          )}
        </section>
      )}

      <section className={CARD} aria-labelledby="recent-h">
        <h2 id="recent-h" className={CARD_TITLE}>Recent sessions</h2>
        {recent.length === 0 ? <p className="text-sm text-[var(--ink-3)]">No sessions logged in the last 4 weeks.</p> : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[...recent].reverse().map(w => (
              <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule-soft)] pb-2 text-sm last:border-0">
                <span>
                  <span className="mr-2 inline-block w-24 font-mono text-xs text-[var(--ink-3)]">{fmtDay(w.date)}</span>
                  <Link href={healthHref({ tab: 'training', session: w.sessionKey, date: w.date })} className="font-semibold text-[var(--ink)] underline">{sessionName(enrolment, w.sessionKey)}</Link>
                  <span className="ml-2 text-xs text-[var(--ink-3)]">
                    {w.status}{w.skipReason ? ` — ${w.skipReason}` : ''}{w.durationMinutes ? ` · ${w.durationMinutes} min` : ''}{w.travelMode ? ' · travel' : ''}
                  </span>
                </span>
                <DeleteWorkoutButton id={w.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ActivitySection userId={userId} enrolment={enrolment} date={ctx.today} painPassed={ctx.painPassed} checks={ctx.checks} title="Cardio (Zone 2) & steps" />

      <section className={CARD} aria-labelledby="hist-h">
        <h2 id="hist-h" className={CARD_TITLE}>Exercise history</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {def.trainingSessions.map(t => (
            <div key={t.key}>
              <h3 className="mb-1 text-sm font-bold text-[var(--ink)]">{t.name}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {t.exercises.map(e => (
                  <li key={e.key}><Link href={healthHref({ tab: 'training', exercise: e.key })} className="text-sm text-[var(--blue-700)] underline">{e.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Player ──────────────────────────────────────────────────────────────────

async function PlayerLoader({ userId, enrolment, ctx, session, date, travel }: {
  userId: string; enrolment: ActiveEnrolment; ctx: TrainingContext; session: TrainingSession; date: string; travel: boolean
}) {
  const def = enrolment.def
  const supabase = await createClient()
  const position = trainingPosition(def, enrolment.startDate, date)
  const week = position.phase === 'active' ? position.week : null
  const excluded = def.movementRestrictions?.excluded ?? []
  const unlocked = unlockHostSession(def) === session.key
    ? ctx.unlocks.filter(u => u.available && u.exercise).map(u => u.exercise!)
    : []
  const all = [...session.exercises, ...unlocked]

  let history: Awaited<ReturnType<typeof loadExerciseHistory>>
  let workouts: Awaited<ReturnType<typeof loadWorkouts>>
  let trips: Awaited<ReturnType<typeof loadTripRanges>>
  try {
    ;[history, workouts, trips] = await Promise.all([
      loadExerciseHistory(supabase, userId, all.map(e => e.key)),
      loadWorkouts(supabase, userId, addDays(date, -7), addDays(date, 1)),
      loadTripRanges(supabase, userId, enrolment),
    ])
  } catch {
    return <HealthNotice title="Could not load the session">Try again shortly.</HealthNotice>
  }

  const isLight = (w: number | null) => {
    if (w === null) return false
    const b = blockForWeek(def, w).block
    return !!b && (b.lightWeeks.includes(w) || b.deloadWeeks.includes(w))
  }
  const currentLight = position.light || position.deload

  const exercises: PlayerExercise[] = all.map(ex => {
    const isUnlock = !session.exercises.some(e => e.key === ex.key)
    const rx = prescriptionFor(enrolment, session.key, ex.key, week, ctx.painPassed)!
    const entries = history[ex.key] ?? []
    const prior = entries.filter(e => e.date < date)
    const last = prior[prior.length - 1] ?? null
    const safety = exerciseSafety(ex, ctx.joint)
    let suggestion: ProgressionSuggestion | null = null
    if (last) {
      const rxLast = prescriptionFor(enrolment, session.key, ex.key, isUnlock ? null : last.week, ctx.painPassed) ?? rx
      if (!currentLight && isLight(last.week)) {
        suggestion = { kind: 'keep', message: 'Back to your normal load after the lighter week.' }
      } else {
        // Light / deload sessions are left out so a lighter week never reads as a stall.
        suggestion = progressionSuggestion(def, ex, rxLast, prior.filter(p => !isLight(p.week)).slice(-3), {
          suppressedReason: safety.suppressProgression ? 'Progression paused for this exercise by the joint rule.' : null,
          lightOrDeload: currentLight,
          // Hold cap from TODAY's prescription (Block 2+ wall sit → 60 s only while the pain rule is passed).
          holdCapSeconds: rx.holdCapSeconds,
        })
      }
    }
    const lastNormal = [...prior].reverse().find(p => !isLight(p.week)) ?? last
    const startLoad = suggestedStartLoad(lastNormal?.sets ?? null, suggestion, rx.loadFactor)
    const shown = displayName(ex, true, excluded)
    const travelName = shown !== ex.name ? shown : null
    return {
      key: ex.key,
      name: ex.name,
      travelName,
      videoUrl: ex.videoUrl ?? youtubeSearchUrl(ex.name),
      travelVideoUrl: travelName ? youtubeSearchUrl(travelName) : null,
      notes: ex.notes ?? null,
      tempo: ex.tempo ?? null,
      perSide: ex.perSide,
      supersetGroup: ex.supersetGroup ?? null,
      jointWatch: ex.jointWatch,
      usesLoad: usesDumbbells(ex) || !!last?.sets.some(s => (s.loadKg ?? 0) > 0),
      isUnlock,
      rx,
      last: last ? { date: last.date, sets: last.sets } : null,
      suggestion,
      startLoad,
      safety,
    }
  })

  const savedWorkout = workouts.find(w => w.date === date && w.sessionKey === session.key) ?? null
  const saved: Record<string, LoggedSet[]> = {}
  for (const ex of all) {
    const entry = (history[ex.key] ?? []).find(e => e.date === date)
    if (entry) saved[ex.key] = entry.sets
  }
  const savedCheck = savedWorkout ? ctx.checks.find(c => c.workoutId === savedWorkout.id) : undefined

  const warnings: string[] = []
  const weekOfDate = workouts.filter(w => w.date !== date)
  if (!savedWorkout) {
    const order = orderWarning(def, session.key, weekOfDate.filter(w => w.date >= addDays(date, -6)))
    if (order && date === ctx.today) warnings.push(order)
  }
  const spacing = spacingWarning(weekOfDate, date)
  if (spacing) warnings.push(spacing)
  if (position.phase === 'before_start') warnings.push(`Your programme starts on ${fmtDay(enrolment.startDate)}.`)

  return (
    <SessionPlayer
      key={`${session.key}:${date}`}
      date={date}
      isToday={date === ctx.today}
      sessionKey={session.key}
      sessionName={session.name}
      focus={session.focus}
      banner={weekBanner(enrolment, position)}
      warnings={warnings}
      painCheck={session.painCheck && !!def.painRules}
      painThreshold={def.painRules?.okThreshold ?? null}
      exercises={exercises}
      saved={Object.keys(saved).length > 0 ? saved : null}
      savedTravel={savedWorkout?.travelMode ?? false}
      defaultTravel={travel || tripOn(trips, date) !== null}
      savedPain={savedCheck?.duringPain ?? null}
    />
  )
}

// ── Exercise history ────────────────────────────────────────────────────────

async function ExerciseHistory({ userId, enrolment, exerciseKey }: { userId: string; enrolment: ActiveEnrolment; exerciseKey: string }) {
  const def = enrolment.def
  const host = def.trainingSessions.find(s => s.exercises.some(e => e.key === exerciseKey)) ?? def.trainingSessions.find(s => s.key === unlockHostSession(def))
  const ex = host ? findExercise(def, host.key, exerciseKey) : null
  if (!host || !ex) return <HealthNotice title="Exercise not found">That exercise is not in your programme. <Link className="underline" href={healthHref({ tab: 'training' })}>Back to training</Link></HealthNotice>

  const supabase = await createClient()
  let entries: Awaited<ReturnType<typeof loadExerciseHistory>>[string]
  try {
    entries = (await loadExerciseHistory(supabase, userId, [exerciseKey]))[exerciseKey] ?? []
  } catch {
    return <HealthNotice title="Could not load history">Try again shortly.</HealthNotice>
  }
  const series = topSetSeries(entries)
  const isHold = ex.holdSeconds !== undefined && !ex.reps
  const unit = series.some(p => p.value !== null) && entries.some(e => e.sets.some(s => (s.loadKg ?? 0) > 0)) ? 'kg' : isHold ? 's' : ''

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <Link href={healthHref({ tab: 'training' })} className="text-sm font-semibold text-[var(--blue-700)] underline">← Training</Link>
        <h2 className="mt-1 text-xl font-bold text-[var(--ink)]">{ex.name}</h2>
        <p className="text-sm text-[var(--ink-3)]">{host.name} · {entries.length} session{entries.length === 1 ? '' : 's'} logged</p>
        {unit && (
          <div className="mt-3 text-[var(--blue-700)]">
            <LineChart
              values={series.map(p => p.value)}
              title={`${ex.name} — top set`}
              description={`Top set ${unit === 'kg' ? 'load (kg)' : 'hold (s)'} per session`}
              startLabel={entries[0] ? fmtDay(entries[0].date) : undefined}
              endLabel={entries.length ? fmtDay(entries[entries.length - 1].date) : undefined}
            />
            <p className="mt-1 text-xs text-[var(--ink-3)]">Top set {unit === 'kg' ? 'load per dumbbell (kg)' : 'hold (seconds)'} per session.</p>
          </div>
        )}
      </section>
      <section className={CARD} aria-labelledby="eh-h">
        <h2 id="eh-h" className={CARD_TITLE}>Sessions</h2>
        {entries.length === 0 ? <p className="text-sm text-[var(--ink-3)]">Nothing logged yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--ink-3)]">
                  <th className="py-1 pr-3 font-bold">Date</th>
                  <th className="py-1 pr-3 font-bold">Week</th>
                  <th className="py-1 font-bold">Sets</th>
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().map(e => (
                  <tr key={e.workoutId} className="border-t border-[var(--rule-soft)] align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDay(e.date)}</td>
                    <td className="py-2 pr-3">{e.week ?? '—'}</td>
                    <td className="py-2 text-[var(--ink-2)]">
                      {e.sets.map(formatLoggedSet).join(' · ')}
                      {e.substitution && <span className="block text-xs text-[var(--ink-3)]">Travel: {e.substitution}</span>}
                      {e.status === 'partial' && <span className="block text-xs text-amber-800">Partial session</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
