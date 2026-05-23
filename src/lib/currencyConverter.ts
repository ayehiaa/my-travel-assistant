import { ExpenseWithCategory } from '@/types/database'

export type GbpRates = Record<string, Record<string, number>>

interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

async function fetchRatesForDate(
  date: string,
  currencies: string[],
  rateMap: GbpRates,
): Promise<void> {
  const to = currencies.map(encodeURIComponent).join(',')
  const today = new Date().toISOString().slice(0, 10)
  const revalidate = date === today ? 3600 : 31536000

  const primaryUrl = `https://api.frankfurter.app/${date}?from=GBP&to=${to}`

  try {
    const res = await fetch(primaryUrl, { next: { revalidate } })

    if (!res.ok) {
      if (res.status === 404) {
        // Weekend/holiday — retry with latest
        const fallbackUrl = `https://api.frankfurter.app/latest?from=GBP&to=${to}`
        const fallbackRes = await fetch(fallbackUrl, { next: { revalidate: 3600 } })
        if (!fallbackRes.ok) return
        const json: FrankfurterResponse = await fallbackRes.json()
        rateMap[date] = {}
        for (const [currency, rate] of Object.entries(json.rates)) {
          if (typeof rate !== 'number' || rate <= 0) continue
          rateMap[date][currency] = 1 / rate
        }
      }
      // 422 or any other error — skip silently
      return
    }

    const json: FrankfurterResponse = await res.json()
    rateMap[date] = {}
    for (const [currency, rate] of Object.entries(json.rates)) {
      if (typeof rate !== 'number' || rate <= 0) continue
      rateMap[date][currency] = 1 / rate
    }
  } catch {
    // Network error / timeout — skip silently
  }
}

export async function buildGbpRates(
  expenses: ExpenseWithCategory[],
): Promise<GbpRates> {
  // Group non-GBP currencies by unique date
  const dateCurrencyMap = new Map<string, Set<string>>()

  for (const expense of expenses) {
    if (expense.currency === 'GBP') continue
    const date = expense.expense_date
    if (!dateCurrencyMap.has(date)) {
      dateCurrencyMap.set(date, new Set())
    }
    dateCurrencyMap.get(date)!.add(expense.currency)
  }

  if (dateCurrencyMap.size === 0) return {}

  const rateMap: GbpRates = {}

  await Promise.all(
    Array.from(dateCurrencyMap.entries()).map(([date, currencySet]) =>
      fetchRatesForDate(date, Array.from(currencySet), rateMap),
    ),
  )

  return rateMap
}

export function convertAmountToGbp(
  amount: number,
  currency: string,
  date: string,
  rates: GbpRates,
): number | null {
  if (currency === 'GBP') return amount
  const rate = rates[date]?.[currency]
  if (rate !== undefined) return amount * rate
  return null
}
