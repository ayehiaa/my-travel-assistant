export interface GmailMessage {
  id: string
  from: string
  subject: string
  bodyText: string
}

const TRUSTED_DOMAINS = [
  'britishairways.com', 'ba.com', 'ryanair.com', 'easyjet.com', 'lufthansa.com',
  'emirates.com', 'singaporeair.com', 'qatarairways.com', 'united.com',
  'delta.com', 'aa.com', 'klm.com', 'airfrance.fr',
  'flightconfirmations.com', 'etihad.com', 'virginatlantic.com',
  'expedia.com', 'booking.com', 'kayak.com', 'skyscanner.com', 'opodo.com',
  'tui.com', 'jet2.com', 'wizz.com', 'wizzair.com', 'norwegian.com',
]

export function isTrustedSender(from: string): boolean {
  const match = from.match(/<([^>]+)>/)
  const email = match ? match[1].toLowerCase() : from.toLowerCase().trim()
  const emailDomain = email.split('@')[1] ?? ''
  // Allow exact match and subdomains (e.g. email.britishairways.com)
  return TRUSTED_DOMAINS.some(d => emailDomain === d || emailDomain.endsWith(`.${d}`))
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8')
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractBody(payload: Record<string, unknown>): string {
  // Prefer text/plain, fall back to text/html
  function walk(part: Record<string, unknown>): string {
    const mimeType = part.mimeType as string
    const body = part.body as { data?: string } | undefined
    const parts = part.parts as Record<string, unknown>[] | undefined

    if (mimeType === 'text/plain' && body?.data) {
      return decodeBase64Url(body.data)
    }
    if (parts) {
      for (const child of parts) {
        const result = walk(child as Record<string, unknown>)
        if (result) return result
      }
    }
    if (mimeType === 'text/html' && body?.data) {
      return stripHtml(decodeBase64Url(body.data))
    }
    return ''
  }
  return walk(payload)
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export interface FetchFlightEmailsResult {
  messages: GmailMessage[]
  rawCount: number
  filteredSenders: string[]
}

export async function fetchFlightEmails(accessToken: string): Promise<FetchFlightEmailsResult> {
  const query = encodeURIComponent('(confirmation OR itinerary OR "e-ticket" OR "booking confirmed" OR "your booking") (flight OR airline OR airport)')
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (listRes.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`)

  const listData = await listRes.json() as { messages?: { id: string }[] }
  const messageIds = listData.messages ?? []

  const settled = await Promise.allSettled(
    messageIds.map(async ({ id }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!msgRes.ok) throw new Error(`Gmail fetch message ${id} failed: ${msgRes.status}`)
      const msg = await msgRes.json() as {
        id: string
        payload: { headers: { name: string; value: string }[]; mimeType: string; body?: { data?: string }; parts?: unknown[] }
      }
      const headers = msg.payload.headers
      const from = getHeader(headers, 'From')
      const subject = getHeader(headers, 'Subject')
      const bodyText = extractBody(msg.payload as Record<string, unknown>)
      return { id, from, subject, bodyText } satisfies GmailMessage
    })
  )

  const fetched = settled
    .filter((r): r is PromiseFulfilledResult<GmailMessage> => r.status === 'fulfilled')
    .map(r => r.value)

  const trusted = fetched.filter(m => isTrustedSender(m.from))
  const filteredSenders = fetched.filter(m => !isTrustedSender(m.from)).map(m => m.from)

  return { messages: trusted, rawCount: fetched.length, filteredSenders }
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  const data = await res.json() as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}
