import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { Trip } from '@/types/database'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!roleRecord || roleRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const { data: trip, error: fetchError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !trip) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from('trips')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await logAudit({
    performedBy: user.id,
    action: 'deleted',
    tripId: null,
    tripSnapshot: trip as Trip,
  })

  return new NextResponse(null, { status: 204 })
}
