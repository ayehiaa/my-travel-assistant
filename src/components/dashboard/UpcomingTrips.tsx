import { TripWithUsers } from '@/types/database'
import TripCard from './TripCard'
import EmptyState from './EmptyState'

type Props = {
  trips: TripWithUsers[]
  canDelete: boolean
}

export default function UpcomingTrips({ trips, canDelete }: Props) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-700 mb-3">Upcoming Trips</h2>
      {trips.length === 0 ? (
        <EmptyState message="No upcoming trips — search for flights to plan your next one." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} canDelete={canDelete} />
          ))}
        </div>
      )}
    </section>
  )
}
