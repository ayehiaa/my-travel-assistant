export interface ParsedReceiptData {
  title:    string | null
  amount:   number | null
  currency: string | null
  date:     string | null
  category: string | null
}

const ALL_NULL: ParsedReceiptData = { title: null, amount: null, currency: null, date: null, category: null }

export function parseReceiptResponse(text: string): ParsedReceiptData {
  // Strip markdown fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  if (cleaned === 'null') return { ...ALL_NULL }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return { ...ALL_NULL }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ...ALL_NULL }
  }

  const obj = parsed as Record<string, unknown>

  // If none of the five expected keys are present, return all-null
  const expectedKeys = ['title', 'amount', 'currency', 'date', 'category']
  if (!expectedKeys.some(k => k in obj)) {
    return { ...ALL_NULL }
  }

  // Coerce title
  let title: string | null = null
  if (typeof obj['title'] === 'string' && obj['title'].trim().length > 0) {
    title = obj['title'].trim().slice(0, 200)
  }

  // Coerce amount
  let amount: number | null = null
  if (typeof obj['amount'] === 'number' && obj['amount'] >= 0 && isFinite(obj['amount'])) {
    amount = obj['amount']
  } else if (typeof obj['amount'] === 'string') {
    const parsed = parseFloat(obj['amount'])
    if (!isNaN(parsed) && parsed >= 0 && isFinite(parsed)) {
      amount = parsed
    }
  }

  // Coerce currency
  let currency: string | null = null
  if (typeof obj['currency'] === 'string') {
    const trimmed = obj['currency'].trim()
    if (trimmed.length >= 1 && trimmed.length <= 10) {
      currency = trimmed.toUpperCase()
    }
  }

  // Coerce date
  let date: string | null = null
  if (typeof obj['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj['date'])) {
    date = obj['date']
  }

  // Coerce category
  let category: string | null = null
  if (typeof obj['category'] === 'string') {
    const trimmed = obj['category'].trim()
    if (trimmed.length > 0 && trimmed.length <= 100) {
      category = trimmed
    }
  }

  return { title, amount, currency, date, category }
}
