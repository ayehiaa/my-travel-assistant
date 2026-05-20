# Quickstart: Edit Saved Trips

**Branch**: `001-edit-saved-trips` | **Date**: 2026-05-20

## What this feature does

Adds edit (pencil) buttons to every trip card on the dashboard. Clicking opens the
existing `AddPastTripModal` pre-filled with the trip's airports, dates, and trip type.
On save, the trip updates in-place and an audit log entry records the change.

## No DB migrations required

This feature uses only existing tables (`trips`, `trip_legs`, `audit_log`). No SQL
migrations need to be run in Supabase.

## Manual testing checklist

1. **Edit a manual round-trip**:
   - Go to dashboard, find a past trip, click the pencil icon
   - Confirm airports and dates are pre-filled
   - Change the destination airport, click Save
   - Confirm the card updates and a "Trip updated" toast appears

2. **Edit a search-sourced trip**:
   - Find a trip with `source = 'search'` (one with flight number details)
   - Click pencil icon — confirm the amber "Saving will remove stored flight details" warning appears
   - Save — confirm the trip now shows "Manually added" in place of flight numbers

3. **Edit as assistant**:
   - Log in as an assistant user
   - Edit any trip and save
   - Go to Audit Log — confirm the entry shows "by [assistant] on behalf of [main account]"

4. **Validation**:
   - Try to save with an empty date — Save button should remain disabled
   - Try to save a multi-city trip with only 1 leg — not possible (Remove button hidden)

5. **Error handling**:
   - Simulate a 500 by temporarily breaking the PATCH route
   - Confirm an error toast is shown and the modal stays open with edited values

## Key files

| File | Change |
|------|--------|
| `src/app/api/trips/[id]/route.ts` | New PATCH handler |
| `src/components/dashboard/AddPastTripModal.tsx` | Edit mode support |
| `src/components/dashboard/DashboardClient.tsx` | tripToEdit state |
| `src/components/dashboard/UpcomingTrips.tsx` | Thread onEditTrip |
| `src/components/dashboard/TripCard.tsx` | Pencil edit button |
| `src/components/dashboard/PastTrips.tsx` | Pencil edit button on PastRow |
