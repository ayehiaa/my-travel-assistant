import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireHealthUser } from '@/lib/health/healthServer'
import { trainingDbError } from '@/lib/health/trainingServer'

/** Delete a logged training session (its sets and joint check cascade). Owner-only via RLS + user_id filter. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase.from('health_workouts').delete().eq('id', id).eq('user_id', auth.user.id).select('id')
  if (error) return trainingDbError(error)
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
