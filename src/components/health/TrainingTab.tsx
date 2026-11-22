import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { ActiveEnrolment } from '@/lib/health/healthServer'
import { healthHref } from '@/lib/health/healthHub'
import { addDays, isValidDate, programmeWeekLabel } from '@/lib/health/time'
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
import ActivityCard, { type ActivityCardProps } from './ActivityCard'
import { loadActivityProps } from './ActivitySection'
import { effortText, phaseLabel, shortLabel, weekChip, weekDot, type DotState } from '@/lib/health/lifestyleUi'
import Chip from './ui/Chip'
import Disclosure from './ui/Disclosure'
import InfoPopover from './ui/InfoPopover'
import OverflowMenu, { MENU_ITEM } from './ui/OverflowMenu'
import { PRIMARY_BTN } from './ui/Section'
import HealthNotice from './HealthNotice'
import SessionPlayer, { type PlayerExercise } from './SessionPlayer'
import { ApprovalToggle, DeleteWorkoutButton, JointClearanceButton } from './TrainingActions'
import { CARD, CARD_TITLE } from './ui'
import { OfflineSyncBanner } from './offlineSync'

const BACKDATE_DAYS = 60

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function weekBanner(enrolment: ActiveEnrolment, position: TrainingPosition, today: string): string {
  const def = enrolment.def
  if (position.phase === 'before_start') return `Programme starts ${fmtDay(enrolment.startDate)} — sessions use the table as written until then`
  if (position.phase === 'completed') return `${def.identity.name} complete — sessions use the table as written`
  const parts = [programmeWeekLabel(enrolment.startDate, today, def.identity.durationWeeks) ?? `Week ${position.week} of ${def.identity.durationWeeks}`]
  if (position.block) parts.push(position.block.name)
  if (position.light) parts.push('light week')
  if (position.deload) parts.push('deload week')
  return parts.join(' · ')
}


function sessionName(enrolment: ActiveEnrolment, key: string): string {
  return enrolment.def.trainingSessions.find(s => s.key === key)?.name ?? key.toUpperCase()
}

/** Training (specs/029 US5/US6): overview, guided session player (?session=) and exercise history (?exercise=). */
export default async function TrainingTab({ userId, enrolment, session, exercise, date, travel, openCardio = false }: {
  userId: string
  enrolment: ActiveEnrolment
  session?: string
  exercise?: string
  date?: string
  /** ?travel=1 from Today's travel mode. */
  travel?: boolean
  /** ?cardio=1 from the + menu: open the cardio & steps section. */
  openCardio?: boolean
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
  return <Overview userId={userId} enrolment={enrolment} ctx={ctx} openCardio={openCardio} />
}

// ── Overview ────────────────────────────────────────────────────────────────

const DOT: Record<DotState, { cls: string; label: string }> = {
  done:         { cls: 'bg-green-600 text-white', label: 'done' },
  partial:      { cls: 'bg-amber-400 text-white', label: 'partial' },
  skipped:      { cls: 'bg-[var(--ink-4)] text-white', label: 'skipped' },
  missed:       { cls: 'border-2 border-red-500 text-red-700', label: 'missed' },
  today:        { cls: 'border-2 border-[var(--blue-700)] text-[var(--blue-700)]', label: 'today' },
  planned:      { cls: 'border border-[var(--ink-4)] text-[var(--ink-3)]', label: 'planned' },
  cardio:       { cls: 'text-teal-700', label: 'cardio' },
  rest:         { cls: 'text-[var(--ink-4)]', label: 'rest' },
  before_start: { cls: 'border border-dashed border-[var(--ink-4)] text-[var(--ink-4)]', label: 'before start' },
}
const DOT_ICON: Partial<Record<DotState, string>> = { done: '✓', partial: '½', missed: '!', skipped: '–', cardio: '♥', rest: '·' }

export interface TrainOverviewModel {
  today: string
  phase: string
  phaseInfo: string[]
  joint: { level: 'ok' | 'reduce' | 'stop'; message: string; uncleared: { id: string; date: string; redFlags: string[] } | null }
  week: Array<{ date: string; letter: string; dot: DotState; title: string; href: string | null; isToday: boolean }>
  next: { name: string; focus: string; meta: string; href: string } | null
  reason: string
  warnings: string[]
  sessions: Array<{ key: string; name: string; href: string }>
  recent: Array<{ id: string; date: string; name: string; href: string; meta: string }>
  jointLine: string | null
  unlocks: Array<{ key: string; name: string; available: boolean; status: string; reason: string; notes: string | null; approval: { approved: boolean; movement: string } | null }>
  excluded: string[]
  history: Array<{ key: string; name: string; exercises: Array<{ key: string; name: string; href: string }> }>
  activity: Omit<ActivityCardProps, 'title'> | null
  openCardio: boolean
}

async function Overview({ userId, enrolment, ctx, openCardio }: { userId: string; enrolment: ActiveEnrolment; ctx: TrainingContext; openCardio: boolean }) {
  const def = enrolment.def
  const supabase = await createClient()
  let recent: Awaited<ReturnType<typeof loadWorkouts>> = []
  try { recent = await loadWorkouts(supabase, userId, addDays(ctx.today, -27), ctx.today) } catch { recent = [] }
  const week = weekSchedule(def, ctx.today, ctx.weekWorkouts, enrolment.startDate)
  const rec = ctx.recommendation
  const pos = ctx.position
  const block = pos.block
  const rules = def.painRules
  const latest = ctx.joint.basis
  const activity = await loadActivityProps({ userId, enrolment, date: ctx.today, painPassed: ctx.painPassed, checks: ctx.checks })
  const nextSession = rec.sessionKey ? def.trainingSessions.find(t => t.key === rec.sessionKey) ?? null : null
  const blockIndex = block ? def.blocks.findIndex(b => b.key === block.key) : -1
  const weekText = weekChip(enrolment.startDate, ctx.today, def.identity.durationWeeks)

  const model: TrainOverviewModel = {
    today: ctx.today,
    phase: [block ? phaseLabel(block.name, blockIndex) : null, weekText, pos.light ? 'Light week' : null, pos.deload ? 'Deload week' : null].filter(Boolean).join(' · '),
    phaseInfo: [
      weekBanner(enrolment, pos, ctx.today),
      ...(block ? [`${block.focus} · ${block.repRange} reps${block.rir ? ` · ${effortText(block.rir)}` : ''}`] : []),
      ...(block?.intensityTechnique ? [block.intensityTechnique] : []),
      ...(def.weeklySchedule?.spacingRules ?? []),
    ],
    joint: {
      level: ctx.joint.level,
      message: ctx.joint.message ?? '',
      uncleared: ctx.joint.uncleared?.id ? { id: ctx.joint.uncleared.id, date: fmtDay(ctx.joint.uncleared.date), redFlags: ctx.joint.uncleared.redFlags } : null,
    },
    week: week.map(d => ({
      date: d.date,
      letter: fmtDay(d.date).slice(0, 2),
      dot: weekDot(d),
      title: `${fmtDay(d.date)}: ${shortLabel(d.label)}${d.status ? ` — ${STATUS_WORD[d.status] ?? d.status}` : ''}${d.workouts.filter(w => w.sessionKey !== d.sessionKey).map(w => ` (${sessionName(enrolment, w.sessionKey)} ${w.status})`).join('')}`,
      href: d.sessionKey ? healthHref({ tab: 'train', session: d.sessionKey, date: d.date < ctx.today ? d.date : null }) : null,
      isToday: d.date === ctx.today,
    })),
    next: nextSession ? {
      name: nextSession.name,
      focus: nextSession.focus,
      meta: `${nextSession.exercises.length} exercises · ${nextSession.exercises.reduce((n, e) => n + (e.sets ?? 0), 0)} sets`,
      href: healthHref({ tab: 'train', session: nextSession.key }),
    } : null,
    reason: rec.reason,
    warnings: rec.warnings,
    sessions: def.trainingSessions.map(t => ({ key: t.key, name: `${t.name} · ${t.focus}`, href: healthHref({ tab: 'train', session: t.key }) })),
    recent: [...recent].reverse().map(w => ({
      id: w.id, date: fmtDay(w.date), name: sessionName(enrolment, w.sessionKey),
      href: healthHref({ tab: 'train', session: w.sessionKey, date: w.date }),
      meta: `${w.status}${w.skipReason ? ` — ${w.skipReason}` : ''}${w.durationMinutes ? ` · ${w.durationMinutes} min` : ''}${w.travelMode ? ' · travel' : ''}`,
    })),
    jointLine: rules ? (latest
      ? `${fmtDay(latest.date)}: ${outcomeLabel(evaluateJointCheck(rules, latest))}${latest.duringPain !== null ? ` · ${latest.duringPain}/10 during` : ''}${latest.nextMorningPain !== null ? ` · ${latest.nextMorningPain}/10 next morning` : ''}`
      : 'No joint check yet') : null,
    unlocks: ctx.unlocks.map(u => ({
      key: u.key,
      name: u.exercise?.name ?? u.movement,
      available: u.available,
      status: u.available ? `Unlocked · ${sessionName(enrolment, unlockHostSession(def) ?? '')}` : 'Locked',
      reason: u.reason,
      notes: u.notes ?? null,
      approval: u.requires === 'professional_approval' ? { approved: ctx.approvals.includes(u.key), movement: u.movement } : null,
    })),
    excluded: def.movementRestrictions?.excluded ?? [],
    history: def.trainingSessions.map(t => ({ key: t.key, name: t.name, exercises: t.exercises.map(e => ({ key: e.key, name: e.name, href: healthHref({ tab: 'train', exercise: e.key }) })) })),
    activity: activity.status === 'ok' ? activity.props : null,
    openCardio,
  }
  return <TrainOverview m={model} />
}

const STATUS_WORD: Record<string, string> = {
  done: 'done', partial: 'partial', skipped: 'skipped', moved: 'done another day', missed: 'missed', today: 'today', upcoming: 'planned', before_start: 'before start',
}

/** Train overview (specs/032): phase chip, week strip, today's session → Start, then details behind disclosures. */
export function TrainOverview({ m }: { m: TrainOverviewModel }) {
  return (
    <div className="flex flex-col gap-3">
      <OfflineSyncBanner />
      <div className="flex items-center gap-1">
        <Chip>{m.phase}</Chip>
        {m.phaseInfo.length > 0 && (
          <InfoPopover label="About this phase" align="left">
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">{m.phaseInfo.map(t => <li key={t}>{t}</li>)}</ul>
          </InfoPopover>
        )}
      </div>

      {m.joint.level !== 'ok' && (
        <section className={`rounded-xl border px-4 py-3 ${m.joint.level === 'stop' ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="alert">
          <p className="text-sm font-bold">{m.joint.level === 'stop' ? '▲ Leg work paused' : '! Go easier next session'}</p>
          <p className="mt-0.5 text-xs">{m.joint.message}</p>
          {m.joint.uncleared && (
            <div className="mt-2">
              <p className="mb-2 text-xs">{m.joint.uncleared.date}: {m.joint.uncleared.redFlags.join(', ')}</p>
              <JointClearanceButton checkId={m.joint.uncleared.id} />
            </div>
          )}
        </section>
      )}

      <ol className="m-0 grid list-none grid-cols-7 gap-1 rounded-xl border border-[var(--rule)] bg-white p-2" aria-label="This week">
        {m.week.map(d => {
          const dot = (
            <>
              <span className={`text-[11px] font-semibold ${d.isToday ? 'text-[var(--blue-700)]' : 'text-[var(--ink-3)]'}`}>{d.letter}</span>
              <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${DOT[d.dot].cls}`} aria-hidden="true">{DOT_ICON[d.dot] ?? ''}</span>
              <span className="sr-only">{d.title}</span>
            </>
          )
          return (
            <li key={d.date}>
              {d.href
                ? <Link href={d.href} title={d.title} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg hover:bg-[var(--paper-2)]">{dot}</Link>
                : <span title={d.title} className="flex min-h-14 flex-col items-center justify-center gap-1">{dot}</span>}
            </li>
          )
        })}
      </ol>
      <p className="-mt-2 text-center text-[11px] text-[var(--ink-3)]" aria-hidden="true">✓ done · ½ partial · ○ lift · ♥ cardio</p>

      <section aria-label="Today's session" className="rounded-xl border border-[var(--rule)] bg-white p-4">
        {m.next ? (
          <>
            <p className="text-xs font-semibold text-[var(--ink-3)]">Next</p>
            <h2 className="text-lg font-bold text-[var(--ink)]">{m.next.name} <span className="font-normal text-[var(--ink-3)]">· {m.next.focus}</span></h2>
            <p className="text-xs text-[var(--ink-3)]">{m.next.meta}</p>
            {m.warnings.map(w => <p key={w} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">! {w}</p>)}
            <div className="mt-3 flex items-center gap-2">
              <Link href={m.next.href} className={`${PRIMARY_BTN} flex-1`}>Start</Link>
              <OverflowMenu label="Other sessions">
                {m.sessions.map(s => <Link key={s.key} href={s.href} className={MENU_ITEM}>{s.name}</Link>)}
              </OverflowMenu>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-[var(--ink)]">{m.reason}</p>
            <OverflowMenu label="Open a session">
              {m.sessions.map(s => <Link key={s.key} href={s.href} className={MENU_ITEM}>{s.name}</Link>)}
            </OverflowMenu>
          </div>
        )}
      </section>

      {m.activity && (
        <Disclosure id="cardio" title="Cardio & steps" meta={m.activity.migrationNeeded ? undefined : `${m.activity.weekly.minutes}${m.activity.weekly.target !== null ? `/${m.activity.weekly.target}` : ''} min`} open={m.openCardio}>
          <ActivityCard {...m.activity} bare />
        </Disclosure>
      )}

      <Disclosure title="Recent sessions" meta={`${m.recent.length}`}>
        {m.recent.length === 0 ? <p className="text-sm text-[var(--ink-3)]">None in the last 4 weeks.</p> : (
          <ul className="m-0 flex list-none flex-col divide-y divide-[var(--rule-soft)] p-0">
            {m.recent.map(w => (
              <li key={w.id} className="flex min-h-12 items-center gap-2 py-1">
                <Link href={w.href} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--ink)]">{w.name} <span className="font-normal text-[var(--ink-3)]">· {w.date}</span></span>
                  <span className="block truncate text-xs text-[var(--ink-3)]">{w.meta}</span>
                </Link>
                <DeleteWorkoutButton id={w.id} />
              </li>
            ))}
          </ul>
        )}
      </Disclosure>

      {(m.jointLine || m.unlocks.length > 0) && (
        <Disclosure title="Joint & unlocks" meta={m.unlocks.filter(u => u.available).length ? `${m.unlocks.filter(u => u.available).length} unlocked` : undefined}>
          {m.jointLine && <p className="text-sm text-[var(--ink-2)]">Last joint check: <strong className="text-[var(--ink)]">{m.jointLine}</strong></p>}
          {m.unlocks.length > 0 && (
            <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
              {m.unlocks.map(u => (
                <li key={u.key} className="rounded-lg border border-[var(--rule)] p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-sm text-[var(--ink)]">{u.name}</strong>
                    <Chip tone={u.available ? 'good' : 'neutral'}>{u.available ? '✓ ' : '🔒 '}{u.status}</Chip>
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-2)]">{u.reason}</p>
                  {u.notes && <p className="mt-1 text-xs text-[var(--ink-3)]">{u.notes}</p>}
                  {u.approval && <ApprovalToggle unlockKey={u.key} approved={u.approval.approved} movement={u.approval.movement} />}
                </li>
              ))}
            </ul>
          )}
          {m.excluded.length > 0 && <p className="mt-2 text-xs text-[var(--ink-3)]">Never offered: {m.excluded.join(', ').toLowerCase()}.</p>}
        </Disclosure>
      )}

      <Disclosure title="Exercise history">
        <div className="grid gap-3 md:grid-cols-3">
          {m.history.map(t => (
            <div key={t.key}>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">{t.name}</h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {t.exercises.map(e => (
                  <li key={e.key}><Link href={e.href} className="flex min-h-11 items-center text-sm text-[var(--blue-700)]">{e.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Disclosure>
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
  const week = position.phase === 'active' ? position.prescriptionWeek : null
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
    const order = orderWarning(def, session.key, weekOfDate.filter(w => w.date >= addDays(date, -6)), { date, startDate: enrolment.startDate })
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
      banner={weekBanner(enrolment, position, date)}
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
  if (!host || !ex) return <HealthNotice title="Exercise not found">That exercise is not in your programme. <Link className="underline" href={healthHref({ tab: 'train' })}>Back to Train</Link></HealthNotice>

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
        <Link href={healthHref({ tab: 'train' })} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue-700)]">‹ Train</Link>
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
            <p className="mt-1 text-xs text-[var(--ink-3)]">Top set · {unit === 'kg' ? 'kg per dumbbell' : 'seconds'}</p>
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
