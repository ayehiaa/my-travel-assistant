export interface FredSeries {
  id: string
  title: string
  unit: string
  latest_value: number | null
  observations: Array<{ date: string; value: number | null }>
}

interface FredSeriesConfig {
  id: string
  title: string
  unit: string
}

export const FRED_SERIES_CONFIG: FredSeriesConfig[] = [
  { id: 'GDP',      title: 'Gross Domestic Product',           unit: 'Billions of Dollars' },
  { id: 'CPIAUCSL', title: 'Consumer Price Index',             unit: 'Index 1982-84=100'   },
  { id: 'UNRATE',   title: 'Unemployment Rate',                unit: 'Percent'             },
  { id: 'DGS10',    title: '10-Year Treasury Yield',           unit: 'Percent'             },
  { id: 'T10YIE',   title: '10-Year Breakeven Inflation Rate', unit: 'Percent'             },
]

interface FredObservation {
  date: string
  value: string
}

interface FredApiResponse {
  observations: FredObservation[]
}

export async function fetchOneSeries(config: FredSeriesConfig): Promise<FredSeries> {
  try {
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${config.id}` +
      `&api_key=${process.env.FRED_API_KEY}` +
      `&file_type=json` +
      `&sort_order=desc` +
      `&limit=8`

    const res = await fetch(url)
    if (!res.ok) {
      return { ...config, latest_value: null, observations: [] }
    }

    const json: FredApiResponse = await res.json() as FredApiResponse
    const observations = (json.observations ?? []).map((obs: FredObservation) => ({
      date:  obs.date,
      value: obs.value === '.' ? null : parseFloat(obs.value),
    }))

    const latest_value = observations.find(o => o.value !== null)?.value ?? null

    return { ...config, latest_value, observations }
  } catch {
    // IMPORTANT: Do not log `err` or `url` here — the URL contains FRED_API_KEY in plaintext.
    return { ...config, latest_value: null, observations: [] }
  }
}

export async function fetchFredData(): Promise<FredSeries[]> {
  return Promise.all(FRED_SERIES_CONFIG.map(fetchOneSeries))
}

export const FED_RATES_SERIES_CONFIG: FredSeriesConfig[] = [
  { id: 'FEDFUNDS', title: 'Federal Funds Effective Rate',        unit: 'Percent' },
  { id: 'FEDTARMD', title: 'Fed Funds Target Rate - Upper Limit', unit: 'Percent' },
  { id: 'DGS2',     title: '2-Year Treasury Yield',               unit: 'Percent' },
  { id: 'DGS30',    title: '30-Year Treasury Yield',              unit: 'Percent' },
]

export async function fetchFedRatesData(): Promise<FredSeries[]> {
  return Promise.all(FED_RATES_SERIES_CONFIG.map(fetchOneSeries))
}
