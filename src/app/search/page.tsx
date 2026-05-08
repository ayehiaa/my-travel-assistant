'use client'

import { useRef } from 'react'
import { useFlightSearch } from '@/hooks/useFlightSearch'
import SearchForm from '@/components/search/SearchForm'
import FlightResultsPanel from '@/components/search/FlightResultsPanel'
import TripSummary from '@/components/search/TripSummary'
import FlightCardSkeleton from '@/components/search/FlightCardSkeleton'
import { FlightOffer } from '@/types/flights'

export default function SearchPage() {
  const summaryRef = useRef<HTMLDivElement>(null)
  const {
    tripType, setTripType,
    legs, updateLeg, addLeg, removeLeg,
    selectedFlights, setSelectedFlight,
    searchStatus, searchError, results,
    showSummary, submitSearch, reviewTrip, backToResults,
    saveStatus, saveError, saveTrip,
  } = useFlightSearch()

  function handleReviewTrip() {
    reviewTrip()
    setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const skeletonCount = tripType === 'round_trip' ? 2 : legs.length
  const skeletonTitles = tripType === 'round_trip'
    ? ['Outbound flights', 'Return flights']
    : legs.map((_, i) => `Leg ${i + 1} flights`)

  const allFlightsSelected = selectedFlights.length > 0 && selectedFlights.every(f => f !== null)

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search flights</h1>

      <SearchForm
        tripType={tripType}
        legs={legs}
        onSetTripType={setTripType}
        onUpdateLeg={updateLeg}
        onAddLeg={addLeg}
        onRemoveLeg={removeLeg}
        onSubmit={submitSearch}
        loading={searchStatus === 'loading'}
      />

      {searchStatus === 'loading' && (
        <div className={`mt-6 ${tripType === 'round_trip' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-6'}`}>
          {skeletonTitles.map(title => (
            <div key={title}>
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
              <div className="space-y-3">{[1, 2, 3].map(i => <FlightCardSkeleton key={i} />)}</div>
            </div>
          ))}
        </div>
      )}

      {searchStatus === 'error' && (
        <p className="mt-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {searchError}
        </p>
      )}

      {searchStatus === 'success' && results && !showSummary && (
        <FlightResultsPanel
          results={results}
          selectedFlights={selectedFlights}
          onSelectFlight={setSelectedFlight}
          onReviewTrip={handleReviewTrip}
        />
      )}

      {showSummary && allFlightsSelected && (
        <div ref={summaryRef}>
          <TripSummary
            tripType={tripType}
            legs={legs}
            selectedFlights={selectedFlights as FlightOffer[]}
            onSave={saveTrip}
            onBack={backToResults}
            saving={saveStatus === 'saving'}
            saveError={saveError}
          />
        </div>
      )}
    </div>
  )
}
