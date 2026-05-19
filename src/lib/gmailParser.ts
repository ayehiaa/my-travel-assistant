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

export async function parseEmailForFlight(
  _gmailMessageId: string,
  emailBody: string,
): Promise<ParsedFlight | null> {
  const truncated = emailBody.slice(0, 8000)

  console.log(`[GmailParser] Sending email to Claude (messageId=${_gmailMessageId}, bodyLen=${emailBody.length}, truncatedLen=${truncated.length})`)

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Extract flight booking details from this email. Return ONLY a JSON object with these exact fields:
{
  "from_airport": "<IATA code, 3 chars, e.g. LHR>",
  "to_airport": "<IATA code, 3 chars>",
  "flight_number": "<e.g. BA123>",
  "airline": "<full airline name>",
  "departure_at": "<ISO 8601 datetime, e.g. 2025-06-15T10:30:00>",
  "return_at": "<ISO 8601 datetime or null if one-way>"
}

If you cannot confidently extract flight details, return the literal string: null

Email:
${truncated}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  console.log(`[GmailParser] Claude response for ${_gmailMessageId}: "${text.slice(0, 200)}"`)

  if (text === 'null') {
    console.log(`[GmailParser] Skipping ${_gmailMessageId}: Claude returned null`)
    return null
  }

  try {
    const parsed = JSON.parse(text) as ParsedFlight
    if (!parsed.from_airport || !parsed.to_airport || !parsed.departure_at) {
      console.log(`[GmailParser] Skipping ${_gmailMessageId}: missing required fields`, parsed)
      return null
    }
    console.log(`[GmailParser] Parsed ${_gmailMessageId}:`, parsed)
    return parsed
  } catch (err) {
    console.log(`[GmailParser] JSON parse failed for ${_gmailMessageId}:`, err, 'Raw text:', text)
    return null
  }
}
