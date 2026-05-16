import Skeleton from '@/components/ui/Skeleton'

export default function ExpensesLoading() {
  return (
    <main className="max-w-[1280px] mx-auto px-7 py-10">
      <Skeleton className="h-10 w-48 mb-8" />
      <div className="flex justify-end mb-5">
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--rule)',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
