import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium_plus') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  const supabase = await createClient()

  // Verify the recommendation belongs to this user
  const { data: rec, error: recError } = await supabase
    .from('recommendations')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (recError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch progress rows
  const { data: rows, error: progressError } = await supabase
    .from('run_progress')
    .select('agent_name, status, completed_at')
    .eq('run_id', id)
    .order('created_at')

  if (progressError) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({
    run_id:  id,
    status:  rec.status as string,
    agents:  rows ?? [],
  })
}
