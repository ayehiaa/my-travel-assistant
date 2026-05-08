// days_outside_uk = return_date - departure_date - 1
// Neither the departure day nor the return day count.
export function daysOutsideUK(outboundDepartureAt: string, returnDepartureAt: string): number {
  const d1 = outboundDepartureAt.split('T')[0]
  const d2 = returnDepartureAt.split('T')[0]
  const diffMs = new Date(d2).getTime() - new Date(d1).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays - 1)
}

// Same rule applied to a trip clipped to [windowStart, windowEnd].
// If the trip crosses a boundary, only the days inside the window count,
// still excluding the first and last day of the clipped segment.
export function daysOutsideUKInWindow(
  outboundDepartureAt: string,
  returnDepartureAt: string,
  windowStart: Date,
  windowEnd: Date
): number {
  const tripStart = new Date(outboundDepartureAt.split('T')[0])
  const tripEnd   = new Date(returnDepartureAt.split('T')[0])

  const clippedStart = tripStart < windowStart ? windowStart : tripStart
  const clippedEnd   = tripEnd   > windowEnd   ? windowEnd   : tripEnd

  if (clippedStart >= clippedEnd) return 0

  const diffDays = Math.round((clippedEnd.getTime() - clippedStart.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays - 1)
}
