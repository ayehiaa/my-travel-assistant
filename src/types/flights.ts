export type TimeSlot = 'morning' | 'evening'

export type FlightOffer = {
  id: string
  airline: string
  airlineCode: string
  flightNumber: string
  departureAt: string
  arrivalAt: string
  durationMinutes: number
  stops: number
  price: number
  currency: string
  isBA: boolean
}

export type FlightSearchRequest = {
  origin: string
  destination: string
  departureDate: string
  returnDate: string
  outboundSlot: TimeSlot
  returnSlot: TimeSlot
}

export type FlightSearchResponse = {
  outbound: FlightOffer[]
  return: FlightOffer[]
}
