import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!process.env.POLYGON_API_KEY) {
    return NextResponse.json({ error: 'Ticker search not configured' }, { status: 503 })
  }

  const q = request.nextUrl.searchParams.get('q')
  if (!q || q.trim() === '') {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
  }

  let polygonRes: Response
  try {
    polygonRes = await fetch(
      `https://api.polygon.io/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&market=stocks&limit=10&apiKey=${process.env.POLYGON_API_KEY}`
    )
  } catch {
    return NextResponse.json({ error: 'Ticker search unavailable' }, { status: 502 })
  }

  if (!polygonRes.ok) {
    return NextResponse.json({ error: 'Ticker search unavailable' }, { status: 502 })
  }

  let json: { results?: Array<{ ticker: string; name: string; primary_exchange: string }> }
  try {
    json = await polygonRes.json()
  } catch {
    return NextResponse.json({ error: 'Ticker search unavailable' }, { status: 502 })
  }

  const results = (json.results ?? []).map(r => ({
    ticker: r.ticker,
    name: r.name,
    primary_exchange: r.primary_exchange,
  }))

  return NextResponse.json({ results })
}
