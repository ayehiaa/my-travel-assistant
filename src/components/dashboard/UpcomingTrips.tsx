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
      {trips.length === 0 ? (
        <EmptyState message="No upcoming trips — search for flights to plan your next one." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
          {trips.map(trip => (
            <TripCard key={trip.id} trip={trip} canDelete={canDelete} />
          ))}
        </div>
      )}
    </section>
  )
}
