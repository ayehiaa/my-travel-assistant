import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getActiveMainAccountId } from '@/lib/activeAccount'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken, encryptToken } from '@/lib/gmailCrypto'
import { fetchFlightEmails, refreshAccessToken } from '@/lib/gmail'
import { parseEmailForFlight } from '@/lib/gmailParser'

export const GmailCandidateSchema = z.object({
  gmail_message_id: z.string(),
  from: z.string(),
  subject: z.string(),
  parsed: z.object({
    from_airport:  z.string(),
    to_airport:    z.string(),
    flight_number: z.string(),
    airline:       z.string(),
    departure_at:  z.string(),
    return_at:     z.string().nullable(),
  }).nullable(),
})
export type GmailCandidate = z.infer<typeof GmailCandidateSchema>

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'premium') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const activeMainAccountId = await getActiveMainAccountId(user)
  const supabase = await createClient()

  // Fetch token row
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', activeMainAccountId)
    .single()

  if (!tokenRow) return NextResponse.json({ error: 'NOT_CONNECTED' }, { status: 400 })

  let accessToken: string

  // Refresh if expiring within 5 minutes
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  // token_iv is stored as "accessIv:refreshIv"
  const [accessIv, refreshIv] = tokenRow.token_iv.split(':')

  if (needsRefresh) {
    const refreshToken = decryptToken(tokenRow.encrypted_refresh_token, refreshIv)
    const refreshed = await refreshAccessToken(refreshToken)
    const { ciphertext: encryptedAccess, iv: newAccessIv } = encryptToken(refreshed.accessToken)
    const admin = createAdminClient()
    await admin.from('google_tokens').update({
      encrypted_access_token: encryptedAccess,
      token_iv: `${newAccessIv}:${refreshIv}`,
      expires_at: refreshed.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', activeMainAccountId)
    accessToken = refreshed.accessToken
  } else {
    accessToken = decryptToken(tokenRow.encrypted_access_token, accessIv)
  }

  // Fetch already-imported message IDs
  const { data: imported } = await supabase
    .from('gmail_imported_messages')
    .select('gmail_message_id')
    .eq('user_id', activeMainAccountId)
  const importedIds = new Set((imported ?? []).map(r => r.gmail_message_id))

  // Fetch and filter emails
  const { messages, rawCount, filteredSenders } = await fetchFlightEmails(accessToken)
  const newMessages = messages.filter(m => !importedIds.has(m.id))

  console.log(`[Import] Pipeline: rawCount=${rawCount} trustedSenders=${messages.length} newAfterDedup=${newMessages.length} alreadyImported=${messages.length - newMessages.length}`)

  // Parse sequentially to avoid Claude concurrent connection rate limit
  const results: PromiseSettledResult<GmailCandidate>[] = []
  for (const m of newMessages) {
    const result = await parseEmailForFlight(m.id, m.bodyText)
      .then(parsed => ({ status: 'fulfilled' as const, value: { gmail_message_id: m.id, from: m.from, subject: m.subject, parsed } }))
      .catch(reason => ({ status: 'rejected' as const, reason }))
    results.push(result)
  }

  const fulfilled = results.filter((r): r is PromiseFulfilledResult<GmailCandidate> => r.status === 'fulfilled')
  const candidates: GmailCandidate[] = fulfilled.map(r => r.value).filter(c => c.parsed !== null)

  console.log(`[Import] Parse results: attempted=${results.length} fulfilled=${fulfilled.length} failed=${results.length - fulfilled.length} parsedNonNull=${candidates.length}`)
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.log(`[Import] Parse rejected [${i}]:`, r.reason)
  })

  const debug = process.env.NODE_ENV !== 'production' ? {
    raw_from_gmail: rawCount,
    passed_sender_filter: messages.length,
    filtered_out_senders: filteredSenders,
    after_dedup: newMessages.length,
    already_imported: messages.length - newMessages.length,
    parse_attempted: newMessages.length,
    parse_fulfilled: fulfilled.length,
    parse_failed: results.length - fulfilled.length,
    parsed_non_null: candidates.length,
    trusted_senders: messages.map(m => m.from),
  } : undefined

  return NextResponse.json({ candidates, ...(debug ? { debug } : {}) })
}
