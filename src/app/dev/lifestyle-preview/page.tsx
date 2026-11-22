import { notFound } from 'next/navigation'
import { ToastProvider } from '@/context/ToastContext'
import { parseHealthTab, type HealthTab } from '@/lib/health/healthHub'
import HealthTabs from '@/components/health/HealthTabs'
import LifestyleFab from '@/components/health/LifestyleFab'
import TodayView from '@/components/health/TodayView'
import FoodView from '@/components/health/FoodView'
import { TrainOverview } from '@/components/health/TrainingTab'
import ProgressView from '@/components/health/ProgressView'
import { ProgrammeOverview } from '@/components/health/ProgrammeTab'
import SessionPlayer from '@/components/health/SessionPlayer'
import { SEED_PROGRAMME } from '@/lib/health/seedProgramme'
import { NOW, TODAY, enrolment, foodModel, playerExercises, progressModel, todayModel, trainModel } from './fixtures'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lifestyle preview (dev)' }

/**
 * DEV-ONLY visual preview of the Lifestyle redesign (specs/032) with fixture data: /dev/lifestyle-preview?tab=…
 * (today | food | train | progress | plan | player). 404 in production; the middleware lets it through only outside
 * production. Buttons that save call the real APIs and fail harmlessly here (no session).
 */
export default async function LifestylePreview({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = await searchParams
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab
  const player = raw === 'player'
  const tab: HealthTab = player ? 'train' : parseHealthTab(raw)
  const def = SEED_PROGRAMME
  const c = def.trainingSessions.find(s => s.key === 'c')!

  let body: React.ReactNode
  if (player) {
    body = (
      <SessionPlayer
        date={TODAY} isToday sessionKey="c" sessionName={c.name} focus={c.focus} banner="Phase 1 · Week 3 of 12" warnings={[]}
        painCheck painThreshold={def.painRules?.okThreshold ?? 3} exercises={playerExercises()} saved={null} savedTravel={false} savedPain={null}
      />
    )
  } else if (tab === 'today') body = <TodayView m={todayModel()} />
  else if (tab === 'food') body = <FoodView m={foodModel()} />
  else if (tab === 'train') body = <TrainOverview m={trainModel()} />
  else if (tab === 'progress') body = <ProgressView m={progressModel()} />
  else body = <ProgrammeOverview enrolment={enrolment} />

  return (
    <ToastProvider>
      <main className="mx-auto max-w-[960px] px-4 pb-36 pt-4 md:px-6 md:pb-24 md:pt-8">
        <div className="mb-3 flex items-baseline justify-between gap-2 md:mb-5">
          <h1 className="font-display text-2xl font-bold text-[var(--ink)] md:text-3xl">Lifestyle</h1>
          <p className="text-xs text-[var(--ink-4)]">Not medical advice</p>
        </div>
        <HealthTabs active={tab} />
        {body}
        {!player && (
          <LifestyleFab
            ctx={{ date: TODAY, nowTime: NOW, slots: def.mealSlots, eatingOut: def.eatingOut, componentLabels: Object.fromEntries(def.components.map(x => [x.key, { name: x.name, unit: x.unit }])) }}
            links={{ recent: '?tab=food#recent', weight: '?tab=today', workout: '?tab=train', cardio: '?tab=train' }}
          />
        )}
      </main>
    </ToastProvider>
  )
}
