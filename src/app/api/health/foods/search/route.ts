import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchOpenFoodFacts } from '@/lib/health/openFoodFactsClient'
import { requireHealthUser } from '@/lib/health/healthServer'

/** Packaged-food search (Open Food Facts, cached) for the item editor. Only the search words leave the app. */

const QuerySchema = z.string().trim().min(2).max(100)

export async function GET(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response

  const q = QuerySchema.safeParse(request.nextUrl.searchParams.get('q') ?? '')
  if (!q.success) return NextResponse.json({ error: 'Type at least 2 characters' }, { status: 400 })

  const products = await searchOpenFoodFacts(q.data)
  return NextResponse.json({ products })
}
