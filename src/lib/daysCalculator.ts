// days_outside_uk = return_date - departure_date - 1
// Neither the departure day nor the return day count.
export function daysOutsideUK(outboundDepartureAt: string, returnDepartureAt: string): number {
  const d1 = outboundDepartureAt.split('T')[0]
  const d2 = returnDepartureAt.split('T')[0]
  const diffMs = new Date(d2).getTime() - new Date(d1).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays - 1)
}

// Count days abroad that fall within [windowStart, windowEnd].
// Only the trip's own departure and return days are excluded — window
// boundaries are plain calendar dates and are counted if the user was abroad.
export function daysOutsideUKInWindow(
  outboundDepartureAt: string,
  returnDepartureAt: string,
  windowStart: Date,
  windowEnd: Date
): number {
  const tripStart = new Date(outboundDepartureAt.split('T')[0])
  const tripEnd   = new Date(returnDepartureAt.split('T')[0])

  // Actual days-abroad range: exclude departure and return days
  const firstDay = new Date(tripStart); firstDay.setDate(firstDay.getDate() + 1)
  const lastDay  = new Date(tripEnd);   lastDay.setDate(lastDay.getDate()   - 1)

  if (firstDay > lastDay) return 0

  // Intersect with window — inclusive on both ends
  const start = firstDay < windowStart ? windowStart : firstDay
  const end   = lastDay  > windowEnd   ? windowEnd   : lastDay

  if (start > end) return 0

  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
}
