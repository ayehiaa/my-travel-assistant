# Architect Notes — Most Visited Country Widget

## Feature Summary
Add a "Most Visited Country" stat tile to the timeline page stats grid, displayed alongside the existing "Countries" tile. The widget calculates which country appears most frequently across all user trips and displays it with a count of visits. This provides quick insight into the user's travel patterns without requiring backend changes.

## Backend Tasks
No backend changes required. All trip data is already available client-side and the most-visited calculation can be performed on the client using existing trip leg data.

## Frontend Tasks

### 1. Utility Function — `src/lib/mostVisitedCountry.ts` (create)
- Export `getMostVisitedCountry(trips: TripSlice[]): { country: string; count: number } | null`
- Takes array of trips and returns the country with highest visit count (counting each leg destination once)
- Uses `getAirportInfo()` from existing `src/lib/airportCountry.ts` to map airport codes to countries
- Returns null if no trips exist
- Pure function, test in `src/lib/mostVisitedCountry.test.ts`

### 2. TripTimeline Component — `src/components/timeline/TripTimeline.tsx` (modify)
- After computing `countries` Set (line 114-116), add call to `getMostVisitedCountry(trips)`
- Store result as state or computed constant
- Add fifth `StatTile` to the 4-up grid in the stat tiles section (line 147-158)
  - Use `tone="sky"` (or alternate color to differentiate from other tiles)
  - Icon: `"🏆"` (trophy emoji to signify "top" destination)
  - Label: `"Top destination"` 
  - Value: country name from result
  - Delta: `"X visits"` or `"1 visit"` based on count
- Update grid `gridTemplateColumns` from `'repeat(4, 1fr)'` to `'repeat(5, 1fr)'` to accommodate new tile
- Tile should appear after Countries tile (4th position → new 5th position)

### 3. Tests — `src/lib/mostVisitedCountry.test.ts` (create)
- Test with single trip visiting UK: returns `{ country: 'United Kingdom', count: 1 }`
- Test with multiple trips to same country: returns country with highest count
- Test with tie between countries: returns one of them consistently
- Test with no trips: returns `null`
- Test with international multi-leg trip: counts destination countries only (not origin)
