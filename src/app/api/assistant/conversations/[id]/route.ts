import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { toUiMessages } from '@/lib/assistant/history'
import { ASSISTANT_MIGRATION_MESSAGE } from '@/lib/assistant/config'
import { AssistantStoreError, deleteConversation, getConversation, loadMessages, renameConversation } from '@/lib/assistant/store'

/**
 * My Assistant (specs/033) — one conversation (owner only; RLS enforces it too).
 * GET → messages rendered for the UI (questions, answers, tool names — never thinking blocks or tool payloads).
 * PATCH {title} renames (messages are never updated). DELETE removes the conversation and its messages.
 */

const IdSchema = z.string().uuid()
const PatchSchema = z.object({ title: z.string().trim().min(1).max(120) })

function storeError(err: unknown) {
  if (err instanceof AssistantStoreError && err.migrationMissing) {
    return NextResponse.json({ error: ASSISTANT_MIGRATION_MESSAGE, code: 'migration_missing' }, { status: 503 })
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const supabase = await createClient()
  try {
    const conversation = await getConversation(supabase, user.id, id.data)
    if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const messages = toUiMessages(await loadMessages(supabase, user.id, conversation.id))
    return NextResponse.json({ conversation, messages })
  } catch (err) {
    return storeError(err)
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = PatchSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ error: 'Title must be 1–120 characters' }, { status: 400 })
  const supabase = await createClient()
  try {
    const ok = await renameConversation(supabase, user.id, id.data, body.data.title)
    return ok ? NextResponse.json({ ok: true, title: body.data.title }) : NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  } catch (err) {
    return storeError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = IdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid conversation id' }, { status: 400 })
  const supabase = await createClient()
  try {
    const ok = await deleteConversation(supabase, user.id, id.data)
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  } catch (err) {
    return storeError(err)
  }
}
