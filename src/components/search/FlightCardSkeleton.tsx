export default function FlightCardSkeleton() {
  return (
    <div className="rounded-xl border-2 border-gray-100 bg-white p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-200" />
          <div className="space-y-1">
            <div className="h-3 w-28 rounded bg-gray-200" />
            <div className="h-2.5 w-16 rounded bg-gray-100" />
          </div>
        </div>
        <div className="h-5 w-12 rounded bg-gray-200" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-4 w-10 rounded bg-gray-200" />
        <div className="flex-1 mx-3 space-y-1">
          <div className="h-2.5 w-14 mx-auto rounded bg-gray-100" />
          <div className="h-px bg-gray-200" />
          <div className="h-2.5 w-10 mx-auto rounded bg-gray-100" />
        </div>
        <div className="h-4 w-10 rounded bg-gray-200" />
      </div>
    </div>
  )
}
