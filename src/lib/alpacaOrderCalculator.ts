/**
 * computeOrderQty
 *
 * For buys:  floor(deltaUsd / askPrice)   — deltaUsd is positive
 * For sells: min(floor(abs(deltaUsd) / askPrice), positionQtyHeld)
 *            — capped at what the user actually holds
 *
 * Returns 0 (never negative) when:
 *   - deltaUsd is 0
 *   - askPrice is 0 or negative (guard against division by zero)
 *   - floor division yields 0
 */
export function computeOrderQty(
  deltaUsd: number,
  askPrice: number,
  positionQtyHeld: number,
  side: 'buy' | 'sell'
): number {
  if (askPrice <= 0) return 0
  if (deltaUsd === 0) return 0

  if (side === 'buy') {
    return Math.max(0, Math.floor(deltaUsd / askPrice))
  } else {
    const computed = Math.floor(Math.abs(deltaUsd) / askPrice)
    return Math.min(computed, Math.max(0, positionQtyHeld))
  }
}

/**
 * isNYSEOpen
 *
 * Returns true if the current UTC time falls within NYSE regular
 * trading hours: Monday–Friday, 9:30am–4:00pm US/Eastern.
 * Uses Intl for timezone conversion — no external dependencies.
 */
export function isNYSEOpen(): boolean {
  const now = new Date()
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = etTime.getDay() // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return false
  const totalMinutes = etTime.getHours() * 60 + etTime.getMinutes()
  return totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60
}
