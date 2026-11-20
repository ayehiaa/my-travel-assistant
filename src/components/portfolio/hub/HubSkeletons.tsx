import Skeleton from '@/components/ui/Skeleton'
import type { HubTab } from '@/lib/portfolioHub'

export function CardSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5 ${className}`}>
      <Skeleton className="mb-3 h-4 w-32" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`mb-2 h-3 ${i % 2 === 0 ? 'w-full' : 'w-2/3'}`} />
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-white p-4 md:p-5">
      <div className="mb-4 flex justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-36" />
      </div>
      <Skeleton className="h-40 w-full md:h-52" />
    </div>
  )
}

/** Fallback for a whole tab while its server data loads. */
export function TabSkeleton({ tab }: { tab: HubTab }) {
  if (tab === 'overview') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <div className="rounded-xl border border-[var(--rule)] bg-white p-5">
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="mb-3 h-8 w-48" />
          <Skeleton className="h-3 w-56" />
        </div>
        <ChartSkeleton />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={5} />
      </div>
    )
  }
  if (tab === 'activity') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading">
        <div className="flex gap-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
        </div>
        {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} lines={1} />)}
      </div>
    )
  }
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <CardSkeleton lines={3} />
      <CardSkeleton lines={5} />
      <CardSkeleton lines={4} />
    </div>
  )
}
