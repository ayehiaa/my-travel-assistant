const AIRLINE_COLORS: Record<string, string> = {
  BA: 'bg-blue-700',
  EK: 'bg-red-600',
  LH: 'bg-yellow-500',
  AF: 'bg-blue-500',
  KL: 'bg-sky-500',
  TK: 'bg-red-700',
  QR: 'bg-purple-700',
  EY: 'bg-orange-600',
  FR: 'bg-yellow-400',
  U2: 'bg-orange-500',
  VS: 'bg-red-500',
  IB: 'bg-orange-700',
  AZ: 'bg-green-600',
}

export function getAirlineBadgeColor(code: string): string {
  return AIRLINE_COLORS[code] ?? 'bg-gray-500'
}
