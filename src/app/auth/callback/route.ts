import { createServerClient } from '@supabase/ssr'
import { type EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as EmailOtpType | null
  const rawNext    = searchParams.get('next') ?? '/'
  const next       = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

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

  // PKCE flow — code exchanged for session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user: sessionUser } } = await supabase.auth.getUser()
      if (sessionUser) {
        const admin = createAdminClient()
        const { data: existingRole } = await admin
          .from('user_roles')
          .select('user_id')
          .eq('user_id', sessionUser.id)
          .maybeSingle()
        if (!existingRole) {
          const displayName =
            (sessionUser.user_metadata?.display_name as string | undefined) ??
            sessionUser.email ??
            'User'
          await admin
            .from('user_roles')
            .insert({ user_id: sessionUser.id, role: 'main', display_name: displayName })
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // OTP / email-link flow — token_hash verified directly (used by password recovery emails)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
