import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_ACCOUNT_COOKIE } from '@/lib/activeAccount'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { mainAccountId } = await request.json()
  if (!mainAccountId) return NextResponse.json({ error: 'mainAccountId required' }, { status: 400 })

  // Validate this assistant is actually linked to the requested main account
  const { data } = await supabase
    .from('account_links')
    .select('main_user_id')
    .eq('assistant_user_id', user.id)
    .eq('main_user_id', mainAccountId)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACTIVE_ACCOUNT_COOKIE, mainAccountId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
