import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'
import { HEALTH_CONSENT_VERSION, HEALTH_TAB_LABELS, parseHealthTab, parseLogDate } from '@/lib/health/healthHub'
import { loadHealthState, nowFor } from '@/lib/health/healthServer'
import { PROGRAMME_TEMPLATES } from '@/lib/health/seedProgramme'
import { localDate } from '@/lib/health/time'
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
  title: 'Sojourn — Health',
}

/** Health hub: /health?tab=today|log|training|progress|programme (specs/029-health-routines, phase P1a). */
export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
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
    body = (
      <>
        <HealthTabs active={tab} />
        <h2 className="sr-only">{HEALTH_TAB_LABELS[tab]}</h2>
        <Suspense key={`${tab}:${tab === 'log' ? logDate : ''}`} fallback={<HealthTabSkeleton />}>
          {tab === 'today' && <TodayTab userId={user.id} enrolment={enrolment} />}
          {tab === 'log' && <LogTab userId={user.id} enrolment={enrolment} date={logDate} />}
          {tab === 'training' && <TrainingTab enrolment={enrolment} />}
          {tab === 'progress' && <ProgressTab userId={user.id} enrolment={enrolment} />}
          {tab === 'programme' && <ProgrammeTab userId={user.id} email={user.email} enrolment={enrolment} />}
        </Suspense>
      </>
    )
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 pb-28 pt-6 md:px-6 md:pb-12 md:pt-10">
      <div className="mb-4 md:mb-6">
        <h1 className="text-2xl font-bold text-[var(--ink)] md:text-3xl" style={{ fontFamily: 'var(--display)' }}>Health</h1>
        <p className="mt-1 text-sm text-[var(--ink-3)]">Your programme, food, weight and sleep. Not medical advice.</p>
      </div>
      {body}
    </main>
  )
}
