import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as EmailOtpType | null

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) console.error('[invite-callback] exchangeCodeForSession error:', error.message)
    if (!error) return NextResponse.redirect(`${origin}/reset-password`)
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (error) console.error('[invite-callback] verifyOtp error:', error.message, { type, token_hash_prefix: token_hash?.slice(0, 8) })
    if (!error) return NextResponse.redirect(`${origin}/reset-password`)
  }

  console.error('[invite-callback] fallthrough — params:', { hasCode: !!code, hasTokenHash: !!token_hash, type })
  return NextResponse.redirect(`${origin}/login?error=invite_link_expired`)
}
