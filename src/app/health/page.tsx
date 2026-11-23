import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { HEALTH_CONSENT_VERSION, HEALTH_TAB_LABELS, healthHref, legacyTabRedirect, parseHealthTab, parseLogDate, parsePlanWeek, parseProgrammeView } from '@/lib/health/healthHub'
import { loadHealthState, nowFor } from '@/lib/health/healthServer'
import { PROGRAMME_TEMPLATES } from '@/lib/health/seedProgramme'
import { localDate } from '@/lib/health/time'
import LifestyleFab from '@/components/health/LifestyleFab'
import HealthTabs from '@/components/health/HealthTabs'
import HealthNotice from '@/components/health/HealthNotice'
import ConsentGate from '@/components/health/ConsentGate'
import EnrolmentWizard from '@/components/health/EnrolmentWizard'
import TodayTab from '@/components/health/TodayTab'
import LogTab from '@/components/health/LogTab'
import TrainingTab from '@/components/health/TrainingTab'
import ProgressTab from '@/components/health/ProgressTab'
import ProgrammeTab from '@/components/health/ProgrammeTab'
import { HealthTabSkeleton } from '@/components/health/HealthSkeletons'

export const metadata = {
  title: 'Sojourn — Lifestyle',
}

/** Lifestyle hub: /health?tab=today|food|train|progress|plan (specs/029 P1a–P3; redesigned in specs/032). */
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  // Old tab names (log / training / programme) keep working: redirect to the renamed tab with the same query.
  const legacy = legacyTabRedirect(params)
  if (legacy) redirect(legacy)
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!hasFeature(user.access, 'health')) redirect('/')

  const supabase = await createClient()
  const state = await loadHealthState(supabase, user.id)
  const tab = parseHealthTab(params.tab)

  let body: React.ReactNode
  if (state.status === 'migration_needed') {
    body = (
      <HealthNotice title="Health needs a database update">
        The owner must apply <code>supabase/apply_health_p1a.sql</code> in Supabase before Health can store anything.
      </HealthNotice>
    )
  } else if (state.status === 'error') {
    body = <HealthNotice title="Health is unavailable">Could not load your health data — try again shortly.</HealthNotice>
  } else if (state.status === 'invalid_programme') {
    body = <HealthNotice title="Programme could not be read">Your programme data is not in the expected format. Please contact the admin.</HealthNotice>
  } else if (state.status === 'needs_consent') {
    body = <ConsentGate consentVersion={HEALTH_CONSENT_VERSION} />
  } else if (state.status === 'needs_enrolment') {
    body = <EnrolmentWizard templates={PROGRAMME_TEMPLATES.map(t => ({ key: t.key, definition: t.definition }))} today={localDate(new Date(), 'Europe/London')} />
  } else {
    const { enrolment } = state
    const logDate = parseLogDate(params.date, nowFor(enrolment).date)
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
    const training = { session: one(params.session), exercise: one(params.exercise), date: one(params.date), travel: one(params.travel) === '1' }
    const programme = { view: parseProgrammeView(params.view), week: parsePlanWeek(params.week, nowFor(enrolment).date), importId: one(params.import) }
    const suspenseKey = tab === 'food' ? `food:${logDate}`
      : tab === 'train' ? `train:${training.session ?? ''}:${training.exercise ?? ''}:${training.date ?? ''}`
      : tab === 'plan' ? `plan:${programme.view}:${programme.week}:${programme.importId ?? ''}`
      : tab
    const now = nowFor(enrolment)
    const def = enrolment.def
    const inPlayer = tab === 'train' && !!training.session
    body = (
      <>
        <HealthTabs active={tab} withAddSlot={!inPlayer} />
        <h2 className="sr-only">{HEALTH_TAB_LABELS[tab]}</h2>
        <Suspense key={suspenseKey} fallback={<HealthTabSkeleton />}>
          {tab === 'today' && <TodayTab userId={user.id} enrolment={enrolment} editCheckin={one(params.checkin) === '1'} />}
          {tab === 'food' && <LogTab userId={user.id} enrolment={enrolment} date={logDate} />}
          {tab === 'train' && <TrainingTab userId={user.id} enrolment={enrolment} session={training.session} exercise={training.exercise} date={training.date} travel={training.travel} openCardio={one(params.cardio) === '1'} />}
          {tab === 'progress' && <ProgressTab userId={user.id} enrolment={enrolment} />}
          {tab === 'plan' && <ProgrammeTab userId={user.id} email={user.email} enrolment={enrolment} view={programme.view} week={programme.week} importId={programme.importId} />}
        </Suspense>
        {!inPlayer && (
          <LifestyleFab
            ctx={{
              date: now.date, nowTime: now.time, slots: def.mealSlots, eatingOut: def.eatingOut,
              componentLabels: Object.fromEntries(def.components.map(c => [c.key, { name: c.name, unit: c.unit }])),
            }}
            links={{
              recent: `${healthHref({ tab: 'food' })}#recent`,
              weight: `${healthHref({ tab: 'today', checkin: 1 })}#checkin`,
              workout: healthHref({ tab: 'train' }),
              cardio: `${healthHref({ tab: 'train', cardio: 1 })}#cardio`,
            }}
          />
        )}
      </>
    )
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 pb-36 pt-4 md:px-6 md:pb-24 md:pt-8">
      <div className="mb-3 flex items-baseline justify-between gap-2 md:mb-5">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)] md:text-3xl">Lifestyle</h1>
        <p className="text-xs text-[var(--ink-4)]">Not medical advice</p>
      </div>
      {body}
    </main>
  )
}
