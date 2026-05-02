'use client'

import { useRef } from 'react'
import { useFlightSearch } from '@/hooks/useFlightSearch'
import SearchForm from '@/components/search/SearchForm'
import FlightResultsPanel from '@/components/search/FlightResultsPanel'
import TripSummary from '@/components/search/TripSummary'
import FlightCardSkeleton from '@/components/search/FlightCardSkeleton'

export default function SearchPage() {
  const summaryRef = useRef<HTMLDivElement>(null)
  const {
    form, updateForm,
    searchStatus, searchError, results,
    selectedOutbound, setSelectedOutbound,
    selectedReturn, setSelectedReturn,
    showSummary, submitSearch, reviewTrip, backToResults,
    saveStatus, saveError, saveTrip,
  } = useFlightSearch()

  function handleReviewTrip() {
    reviewTrip()
    setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Search flights</h1>

      <SearchForm
        form={form}
        onChange={updateForm}
        onSubmit={submitSearch}
        loading={searchStatus === 'loading'}
      />

      {searchStatus === 'loading' && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Outbound flights</p>
            <div className="space-y-3">{[1, 2, 3].map(i => <FlightCardSkeleton key={i} />)}</div>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Return flights</p>
            <div className="space-y-3">{[1, 2, 3].map(i => <FlightCardSkeleton key={i} />)}</div>
          </div>
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
          selectedOutbound={selectedOutbound}
          selectedReturn={selectedReturn}
          onSelectOutbound={setSelectedOutbound}
          onSelectReturn={setSelectedReturn}
          onReviewTrip={handleReviewTrip}
        />
      )}

      {showSummary && selectedOutbound && selectedReturn && form.origin && form.destination && (
        <div ref={summaryRef}>
          <TripSummary
            outbound={selectedOutbound}
            returnFlight={selectedReturn}
            origin={form.origin}
            destination={form.destination}
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
