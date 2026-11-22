import Skeleton from '@/components/ui/Skeleton'
import { CARD } from './ui'

export function HealthCardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={CARD}>
      <Skeleton className="mb-3 h-4 w-32" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={`mb-2 h-3 ${i % 2 ? 'w-2/3' : 'w-full'}`} />)}
    </div>
  )
}

export function HealthTabSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <HealthCardSkeleton lines={2} />
      <div className="grid gap-4 md:grid-cols-2">
        <HealthCardSkeleton lines={4} />
        <HealthCardSkeleton lines={4} />
      </div>
      <HealthCardSkeleton lines={5} />
    </div>
  )
}
