import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/aiCall'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { AI_KEY_REJECTED_MESSAGE } from '@/lib/aiKeyResolver'
import { checkStopReason } from '@/lib/aiResponse'
import { loadHealthState, migrationResponse, requireHealthUser } from '@/lib/health/healthServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { HEALTH_PHOTO_BUCKET, removePhotos } from '@/lib/health/healthPhotos'
import {
  ImportRequestSchema, MAX_DRAFT_JSON_CHARS, MAX_IMPORT_PDF_BYTES, PROGRAMME_IMPORT_SYSTEM, buildImportPrompt, isOwnImportPath, parseImportResponse,
} from '@/lib/health/programmeImport'
import { P3MigrationNeeded, P3_MIGRATION_MESSAGE, loadOpenDrafts, p3DbError } from '@/lib/health/p3Server'

/**
 * Programme import (specs/029 US1, phase P3): a PDF (≤ 10 MB, uploaded by the browser to the private bucket via
 * …/upload-url) or pasted text → Claude (the user's own key; the PDF as a base64 document block) → a draft with
 * per-section status. The uploaded file is deleted as soon as this request finishes.
 * Nothing activates here: the user reviews every section, then saves (and optionally enrols) via …/[id]/save.
 */

export const maxDuration = 300

const NO_KEY_MESSAGE = 'Add your Anthropic API key in Health → Programme to import a programme with AI'

async function requireConsented(userId: string) {
  const supabase = await createClient()
  const state = await loadHealthState(supabase, userId)
  if (state.status === 'migration_needed') return { ok: false as const, response: migrationResponse() }
  if (state.status === 'needs_consent') return { ok: false as const, response: NextResponse.json({ error: 'Please give consent first' }, { status: 409 }) }
  if (state.status === 'error') return { ok: false as const, response: NextResponse.json({ error: 'Internal server error' }, { status: 500 }) }
  return { ok: true as const, supabase }
}

export async function GET() {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const supabase = await createClient()
  try {
    return NextResponse.json({ drafts: await loadOpenDrafts(supabase, auth.user.id) })
  } catch (err) {
    if (err instanceof P3MigrationNeeded) return NextResponse.json({ error: P3_MIGRATION_MESSAGE, migrationNeeded: true }, { status: 503 })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const parsed = ImportRequestSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Upload a PDF or paste the programme text' }, { status: 400 })
  const body = parsed.data
  const storagePath = 'storagePath' in body ? body.storagePath : null
  const text = 'text' in body ? body.text : ''
  if (storagePath && !isOwnImportPath(storagePath, user.id)) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 })

  try {
    return await runImport(user.id, text, storagePath, 'fileName' in body ? body.fileName ?? null : null)
  } finally {
    // The uploaded file is deleted after extraction, whatever the outcome.
    if (storagePath) await removePhotos([storagePath])
  }
}

async function runImport(userId: string, text: string, storagePath: string | null, rawFileName: string | null): Promise<NextResponse> {
  const user = { id: userId }
  let pdfBase64: string | null = null
  if (storagePath) {
    const { data, error } = await createAdminClient().storage.from(HEALTH_PHOTO_BUCKET).download(storagePath)
    if (error || !data) return NextResponse.json({ error: 'The upload was not found — try again' }, { status: 400 })
    if (data.size > MAX_IMPORT_PDF_BYTES) return NextResponse.json({ error: 'The PDF must be 10 MB or smaller' }, { status: 400 })
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return NextResponse.json({ error: 'That file is not a PDF' }, { status: 400 })
    pdfBase64 = Buffer.from(bytes).toString('base64')
  }

  const consented = await requireConsented(user.id)
  if (!consented.ok) return consented.response
  const { supabase } = consented

  // Fail fast when the P3 table is missing — before spending the user's AI credit.
  const probe = await supabase.from('health_programme_imports').select('id').eq('user_id', user.id).limit(1)
  if (probe.error) return p3DbError(probe.error)

  const key = await resolveAiKeyForUser(user.id).catch(() => null)
  if (!key || !key.ok) return NextResponse.json({ error: NO_KEY_MESSAGE, needsAiKey: true }, { status: 400 })

  let result: Awaited<ReturnType<typeof callClaude>>
  try {
    result = await callClaude({
      role: 'health_import',
      name: 'health_import',
      system: PROGRAMME_IMPORT_SYSTEM,
      user: buildImportPrompt({ hasPdf: !!pdfBase64, text: pdfBase64 ? null : text }),
      documents: pdfBase64 ? [{ mediaType: 'application/pdf', data: pdfBase64 }] : undefined,
      apiKey: key.apiKey,
    })
  } catch (err) {
    const rejected = err instanceof Error && err.message === AI_KEY_REJECTED_MESSAGE
    return NextResponse.json({ error: rejected ? AI_KEY_REJECTED_MESSAGE : 'The AI could not read the programme — try again, or paste the text instead' }, { status: 502 })
  } finally {
    pdfBase64 = null
  }

  const stop = checkStopReason(result.stopReason)
  if (!stop.ok) {
    const msg = stop.reason === 'max_tokens'
      ? 'The programme is too long to extract in one go — paste the most important sections as text'
      : 'The AI declined to read this document'
    return NextResponse.json({ error: msg }, { status: 422 })
  }
  const draft = parseImportResponse(result.text)
  if (!draft) return NextResponse.json({ error: 'Could not find a programme in the document — paste the text instead' }, { status: 422 })
  if (JSON.stringify(draft.sections).length > MAX_DRAFT_JSON_CHARS) {
    return NextResponse.json({ error: 'The extracted programme is too large — paste the main sections as text' }, { status: 422 })
  }

  const fileName = storagePath ? (rawFileName ?? '').replace(/[^\w .()-]/g, '').slice(0, 120) || 'programme.pdf' : null
  const { data, error } = await supabase
    .from('health_programme_imports')
    .insert({
      user_id: user.id,
      status: 'draft',
      source_kind: storagePath ? 'pdf' : 'text',
      file_name: fileName,
      sections: draft.sections,
      statuses: draft.statuses,
      notes: draft.notes,
      confirmed: [],
      ai_usage: result.usage,
    })
    .select('id')
    .single()
  if (error || !data) return p3DbError(error)

  return NextResponse.json({ id: data.id, statuses: draft.statuses, costUsd: result.usage.cost_usd }, { status: 201 })
}
