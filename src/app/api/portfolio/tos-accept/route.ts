import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { hasFeature } from '@/lib/access'
import { createClient } from '@/lib/supabase/server'

export async function POST(): Promise<NextResponse> {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasFeature(user.access, 'portfolio')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()
  const acceptedAt = new Date().toISOString()

  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { user_id: user.id, portfolio_tos_accepted_at: acceptedAt },
      { onConflict: 'user_id' }
    )

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  return NextResponse.json({ accepted_at: acceptedAt })
}
