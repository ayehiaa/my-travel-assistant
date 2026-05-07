import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/auditLogger'
import { Trip } from '@/types/database'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()
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
    onBehalfOf: user.role === 'assistant' ? activeMainAccountId : undefined,
  })

  return new NextResponse(null, { status: 204 })
}
