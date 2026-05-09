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

  const skeletonTitles = tripType === 'round_trip'
    ? ['Outbound flights', 'Return flights']
    : legs.map((_, i) => `Leg ${i + 1} flights`)

  const allFlightsSelected = selectedFlights.length > 0 && selectedFlights.every(f => f !== null)

  return (
    <div>
      {/* Navy hero — contains the search form */}
      <section style={{
        background: 'linear-gradient(135deg, var(--blue-900) 0%, var(--blue-700) 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '48px clamp(16px, 4vw, 32px) 36px',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse 70% 60% at 80% 40%, rgba(26,115,214,.35) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 896, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: 'var(--display)', fontWeight: 700,
            fontSize: 'clamp(28px,4vw,42px)', letterSpacing: '-0.02em',
            color: 'white', margin: '0 0 6px',
          }}>
            Where are you going?
          </h2>
          <p style={{ color: 'rgba(255,255,255,.75)', margin: '0 0 28px', fontSize: 15 }}>
            Round-trip or multi-city · British Airways flights surface first.
          </p>

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
        </div>
      </section>

      {/* Results area */}
      <div style={{ maxWidth: 896, margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px)' }}>
        {searchStatus === 'loading' && (
          <div className="sj-results-skeleton" style={{ display: 'grid', gridTemplateColumns: tripType === 'round_trip' ? '1fr 1fr' : '1fr', gap: 24, marginTop: 32 }}>
            {skeletonTitles.map(title => (
              <div key={title}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 12 }}>{title}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[1, 2, 3].map(i => <FlightCardSkeleton key={i} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {searchStatus === 'error' && (
          <p style={{ marginTop: 24, fontSize: 14, color: 'var(--coral)', background: 'var(--coral-soft)', border: '1px solid var(--coral)', borderRadius: 'var(--r)', padding: '12px 16px' }}>
            {searchError}
          </p>
        )}

        {searchStatus === 'success' && results && !showSummary && (
          <FlightResultsPanel
            results={results}
            legs={legs}
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
    </div>
  )
}
