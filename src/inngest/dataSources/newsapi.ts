// NewsAPI connector for geopolitics and future sentiment agent

export interface NewsArticle {
  title: string
  description: string | null
}

interface NewsApiResponse {
  articles: Array<{ title: string; description?: string | null }>
}

export const GEOPOLITICS_QUERY = 'geopolitical tensions OR sanctions OR trade policy OR elections'

export async function fetchGeopoliticsArticles(): Promise<NewsArticle[]> {
  if (!process.env.NEWS_API_KEY) return []

  try {
    const url =
      `https://newsapi.org/v2/everything` +
      `?q=${encodeURIComponent(GEOPOLITICS_QUERY)}` +
      `&language=en` +
      `&pageSize=10` +
      `&sortBy=publishedAt` +
      `&apiKey=${process.env.NEWS_API_KEY}`

    const res = await fetch(url)
    if (!res.ok) return []

    const json = await res.json() as NewsApiResponse
    return (json.articles ?? []).map(a => ({
      title:       a.title,
      description: a.description ?? null,
    }))
  } catch {
    // IMPORTANT: Do not log `url` or error here — the URL contains NEWS_API_KEY in plaintext.
    return []
  }
}

export const SENTIMENT_QUERY =
  'investor sentiment OR S&P 500 outlook OR earnings season OR market mood OR retail investor'

export async function fetchSentimentArticles(): Promise<NewsArticle[]> {
  if (!process.env.NEWS_API_KEY) return []

  try {
    const url =
      `https://newsapi.org/v2/everything` +
      `?q=${encodeURIComponent(SENTIMENT_QUERY)}` +
      `&language=en` +
      `&pageSize=10` +
      `&sortBy=publishedAt` +
      `&apiKey=${process.env.NEWS_API_KEY}`

    const res = await fetch(url)
    if (!res.ok) return []

    const json = await res.json() as NewsApiResponse
    return (json.articles ?? []).map(a => ({
      title:       a.title,
      description: a.description ?? null,
    }))
  } catch {
    // IMPORTANT: Do not log `url` or error here — the URL contains NEWS_API_KEY in plaintext.
    return []
  }
}
