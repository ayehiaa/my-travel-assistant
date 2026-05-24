import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { getAuthUser, isPremiumOrAbove } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/gmailCrypto'

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  if (!isPremiumOrAbove(user.role)) redirect('/?error=gmail_forbidden')

  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState = cookieStore.get('gmail_oauth_state')?.value
  if (!state || !savedState || state !== savedState) redirect('/?error=gmail_state_mismatch')

  cookieStore.delete('gmail_oauth_state')

  if (!code) redirect('/?error=gmail_no_code')

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) redirect('/?error=gmail_token_exchange_failed')

  const tokenData = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  // Each token gets its own random IV; both IVs stored as "accessIv:refreshIv"
  const { ciphertext: encryptedAccess, iv: accessIv } = encryptToken(tokenData.access_token)
  const { ciphertext: encryptedRefresh, iv: refreshIv } = encryptToken(tokenData.refresh_token)
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  const admin = createAdminClient()
  await admin.from('google_tokens').upsert({
    user_id: user.id,
    encrypted_access_token: encryptedAccess,
    encrypted_refresh_token: encryptedRefresh,
    token_iv: `${accessIv}:${refreshIv}`,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  redirect('/gmail/review')
}
