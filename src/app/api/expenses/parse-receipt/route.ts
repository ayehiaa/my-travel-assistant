import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages/messages'
import { getAuthUser } from '@/lib/auth'
import { parseReceiptResponse } from '@/lib/receiptParser'
import type { ParsedReceiptData } from '@/lib/receiptParser'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const
const MAX_FILE_SIZE = 10 * 1024 * 1024

const receiptFormSchema = z.object({
  file: z.instanceof(File, { message: 'No file provided' }),
})

function verifyMagicBytes(buf: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(buf.slice(0, 8))
  if (mimeType === 'image/jpeg') return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF
  if (mimeType === 'image/png')  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  if (mimeType === 'application/pdf') return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  return false
}

const RECEIPT_PROMPT =
  'Extract expense details from this receipt. Return ONLY a raw JSON object (no markdown, no code fences) with these exact fields:\n' +
  '{\n' +
  '  "title": "<merchant or payee name>",\n' +
  '  "amount": <numeric total paid, positive number>,\n' +
  '  "currency": "<ISO 4217 code e.g. GBP>",\n' +
  '  "date": "<YYYY-MM-DD>"\n' +
  '}\n' +
  'Any field you cannot confidently extract must be null. If you cannot extract any details, return the literal string: null'

export async function POST(request: NextRequest): Promise<NextResponse<ParsedReceiptData | { error: string }>> {
  // Step 1: Auth check
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Step 2: Parse and validate form data with Zod
  const formData = await request.formData()
  const parsed = receiptFormSchema.safeParse({ file: formData.get('file') })
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'No file provided' }, { status: 400 })
  }
  const file = parsed.data.file

  // Step 3: MIME type check
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. JPG, PNG or PDF only.' }, { status: 400 })
  }

  // Step 4: Size check
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 10 MB.' }, { status: 400 })
  }

  // Step 5: Magic bytes check
  const arrayBuffer = await file.arrayBuffer()
  if (!verifyMagicBytes(arrayBuffer, file.type)) {
    return NextResponse.json({ error: 'Invalid file type. JPG, PNG or PDF only.' }, { status: 400 })
  }

  // Step 6: Base64 encode
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  // Step 7: Build content block
  let contentBlock: ContentBlockParam
  if (file.type === 'application/pdf') {
    contentBlock = {
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: base64,
      },
    }
  } else {
    contentBlock = {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: file.type as 'image/jpeg' | 'image/png',
        data: base64,
      },
    }
  }

  // Step 8: Call Anthropic
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: RECEIPT_PROMPT },
          ],
        },
      ],
    })

    // Step 9: Extract text from response
    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Step 10: Parse the response
    const parsed = parseReceiptResponse(text)

    // Step 11: Return parsed data (always 200)
    return NextResponse.json(parsed)
  } catch {
    // Step 12: Catch and return 500
    return NextResponse.json({ error: 'Failed to parse receipt' }, { status: 500 })
  }
}
