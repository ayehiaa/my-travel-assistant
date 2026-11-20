import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { readRunUsage } from '@/lib/aiCost'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const authUser = await getAuthUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (authUser.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const supabase = await createClient()
  const { data } = await supabase
    .from('recommendations')
    .select('*')
    .eq('id', id)
    .eq('user_id', authUser.id)
    .single()

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // run_usage: token usage + cost of the run (null for runs recorded before usage logging)
  return NextResponse.json({ recommendation: data, run_usage: readRunUsage(data) })
}
