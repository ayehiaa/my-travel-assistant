import { NextRequest, NextResponse } from 'next/server'
import { lookupBarcode } from '@/lib/health/openFoodFactsClient'
import { parseBarcode, portionOptions } from '@/lib/health/barcode'
import { requireHealthUser } from '@/lib/health/healthServer'

/** Packaged food by barcode (Open Food Facts, cached). Only the barcode digits leave the app. */
export async function GET(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response

  const code = parseBarcode(request.nextUrl.searchParams.get('code') ?? '')
  if (!code) return NextResponse.json({ error: 'That is not a valid barcode (EAN-8, EAN-13, UPC-A or GTIN-14)' }, { status: 400 })

  const { product, reachable } = await lookupBarcode(code)
  if (!reachable) return NextResponse.json({ error: 'Open Food Facts is not reachable right now — enter the food by hand' }, { status: 503 })
  if (!product) return NextResponse.json({ error: 'Product not found in Open Food Facts — enter it by hand', notFound: true }, { status: 404 })
  return NextResponse.json({ product, portions: portionOptions(product) })
}
