export const EDGAR_USER_AGENT = 'Sojourn contact@sojourn.app'

export interface EdgarFiling {
  ticker:          string
  companyName:     string
  formType:        string
  filingDate:      string
  accessionNumber: string
}

interface SubmissionsJson {
  entityName: string
  filings: {
    recent: {
      form:            string[]
      filingDate:      string[]
      accessionNumber: string[]
    }
  }
}

export async function fetchEdgarFilings(tickers: string[]): Promise<EdgarFiling[]> {
  if (tickers.length === 0) return []

  const results: EdgarFiling[] = []

  for (const ticker of tickers) {
    try {
      const atomUrl =
        `https://www.sec.gov/cgi-bin/browse-edgar` +
        `?action=getcompany&company=${encodeURIComponent(ticker)}&type=10-K` +
        `&dateb=&owner=include&count=1&search_text=&output=atom`

      const atomRes = await fetch(atomUrl, {
        headers: { 'User-Agent': EDGAR_USER_AGENT },
      })
      if (!atomRes.ok) continue

      const atomText = await atomRes.text()
      const match = atomText.match(/CIK=(\d+)/i)
      const cik = match?.[1] ?? null
      if (!cik) continue

      const padded = cik.padStart(10, '0')
      const subUrl = `https://data.sec.gov/submissions/CIK${padded}.json`

      const subRes = await fetch(subUrl, {
        headers: { 'User-Agent': EDGAR_USER_AGENT },
      })
      if (!subRes.ok) continue

      const json = await subRes.json() as SubmissionsJson
      const { form, filingDate, accessionNumber } = json.filings.recent
      const companyName = json.entityName

      const annualIdx = form.findIndex(f => f === '10-K')
      const quarterlyIdx = form.findIndex(f => f === '10-Q')

      for (const idx of [annualIdx, quarterlyIdx]) {
        if (idx !== -1) {
          results.push({
            ticker,
            companyName,
            formType:        form[idx],
            filingDate:      filingDate[idx],
            accessionNumber: accessionNumber[idx],
          })
        }
      }
    } catch {
      // Skip ticker silently on any error
    }
  }

  return results
}
