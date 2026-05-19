import Anthropic from '@anthropic-ai/sdk'

export interface ParsedFlight {
  from_airport: string
  to_airport: string
  flight_number: string
  airline: string
  departure_at: string
  return_at: string | null
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function preFilterEmailBody(text: string): string {
  const lines = text.split('\n')
  const relevant = lines.filter(line => {
    const l = line.trim()
    if (!l || l.length < 4) return false
    if (/\b[A-Z]{3}\b/.test(l)) return true
    if (/\b[A-Z]{2}\s?\d{2,4}\b/.test(l)) return true
    if (/\b\d{1,2}[\s/-][A-Za-z]{3}[\s/-]\d{2,4}\b/.test(l)) return true
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(l)) return true
    if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(l)) return true
    if (/\b\d{1,2}:\d{2}\b/.test(l)) return true
    if (/depart|arriv|flight|outbound|inbound|return|booking|confirm|ref|route|ticket|itinerary|passenger|seat|gate|terminal/i.test(l)) return true
    return false
  })
  return relevant.join('\n').slice(0, 3000)
}

export async function parseEmailForFlight(
  _gmailMessageId: string,
  emailBody: string,
): Promise<ParsedFlight | null> {
  const filtered = preFilterEmailBody(emailBody)

  console.log(`[GmailParser] messageId=${_gmailMessageId} rawLen=${emailBody.length} filteredLen=${filtered.length}`)

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Extract flight booking details from this email excerpt. Return ONLY a raw JSON object (no markdown, no code fences) with these exact fields:
{
  "from_airport": "<IATA code, 3 chars, e.g. LHR>",
  "to_airport": "<IATA code, 3 chars>",
  "flight_number": "<e.g. BA123>",
  "airline": "<full airline name>",
  "departure_at": "<ISO 8601 datetime, e.g. 2025-06-15T10:30:00>",
  "return_at": "<ISO 8601 datetime or null if one-way>"
}

If you cannot confidently extract flight details, return the literal string: null

Email excerpt:
${filtered}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  if (text === 'null') {
    console.log(`[GmailParser] Skipping ${_gmailMessageId}: Claude returned null`)
    return null
  }

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as ParsedFlight
    if (!parsed.from_airport || !parsed.to_airport || !parsed.departure_at) {
      console.log(`[GmailParser] Skipping ${_gmailMessageId}: missing required fields`)
      return null
    }
    console.log(`[GmailParser] Parsed ${_gmailMessageId}: ok`)
    return parsed
  } catch (err) {
    console.log(`[GmailParser] JSON parse failed for ${_gmailMessageId}:`, err)
    return null
  }
}
