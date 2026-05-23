import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const isPublicRoute =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/deactivated' ||
    pathname.startsWith('/auth/') ||
    pathname === '/gmail/callback' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/api/customer-invitations/validate' ||
    pathname === '/api/customer-invitations/accept' ||
    pathname === '/api/auth/signup'

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const signupHasToken = pathname === '/signup' && request.nextUrl.searchParams.has('token')

  if (user && (pathname === '/login' || pathname === '/signup') && !signupHasToken) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  if (user && pathname !== '/deactivated' && !isPublicRoute) {
    const { data: roleStatus } = await supabase
      .from('user_roles')
      .select('status')
      .eq('user_id', user.id)
      .single()

    if (roleStatus?.status === 'deactivated') {
      const url = request.nextUrl.clone()
      url.pathname = '/deactivated'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
