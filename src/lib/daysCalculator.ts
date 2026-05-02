// days_outside_uk = return_date - departure_date - 1
// Neither the departure day nor the return day count.
export function daysOutsideUK(outboundDepartureAt: string, returnDepartureAt: string): number {
  const d1 = outboundDepartureAt.split('T')[0]
  const d2 = returnDepartureAt.split('T')[0]
  const diffMs = new Date(d2).getTime() - new Date(d1).getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays - 1)
}
