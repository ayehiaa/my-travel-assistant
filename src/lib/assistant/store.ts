import type { createClient } from '@/lib/supabase/server'
import { isMissingSchemaError } from '@/lib/invitationRoles'
import { normalizeAreas, type AssistantArea } from './areas'
import type { StoredMessageRow } from './history'

/**
 * My Assistant (specs/033) — persistence (server only). Uses the caller's cookie-bound Supabase client, so owner-only
 * RLS applies to every read and write. Messages are append-only (no update helper exists; the DB also rejects it).
 * Every function reports a missing migration instead of throwing, so the UI can show "database update needed".
 */

export type ServerClient = Awaited<ReturnType<typeof createClient>>
type DbError = { code?: string; message?: string } | null

export class AssistantStoreError extends Error {
  constructor(public readonly migrationMissing: boolean) {
    super(migrationMissing ? 'migration_missing' : 'db_error')
  }
}

function fail(error: DbError): never {
  throw new AssistantStoreError(isMissingSchemaError(error))
}

export interface ConversationRow {
  id: string
  title: string
  areas: AssistantArea[]
  totalCostUsd: number
  createdAt: string
  updatedAt: string
}

function toConversation(r: Record<string, unknown>): ConversationRow {
  const cost = Number(r.total_cost_usd)
  return {
    id: String(r.id),
    title: String(r.title ?? 'New chat'),
    areas: normalizeAreas(r.areas),
    totalCostUsd: Number.isFinite(cost) ? cost : 0,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

const CONV_COLS = 'id, title, areas, total_cost_usd, created_at, updated_at'

export async function listConversations(supabase: ServerClient, userId: string, limit = 50): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select(CONV_COLS)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) fail(error)
  return (data ?? []).map(r => toConversation(r as Record<string, unknown>))
}

export async function getConversation(supabase: ServerClient, userId: string, id: string): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .select(CONV_COLS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) fail(error)
  return data ? toConversation(data as Record<string, unknown>) : null
}

export async function createConversation(supabase: ServerClient, userId: string, title: string, areas: readonly AssistantArea[]): Promise<ConversationRow> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .insert({ user_id: userId, title, areas: [...areas] })
    .select(CONV_COLS)
    .single()
  if (error || !data) fail(error)
  return toConversation(data as Record<string, unknown>)
}

export async function renameConversation(supabase: ServerClient, userId: string, id: string, title: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id)
    .select('id')
  if (error) fail(error)
  return (data ?? []).length > 0
}

export async function deleteConversation(supabase: ServerClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('assistant_conversations')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id')
  if (error) fail(error)
  return (data ?? []).length > 0
}

/** Best effort: bump updated_at and add this answer's cost. Never throws. */
export async function touchConversation(supabase: ServerClient, userId: string, id: string, addCostUsd: number): Promise<void> {
  try {
    const { data } = await supabase.from('assistant_conversations').select('total_cost_usd').eq('user_id', userId).eq('id', id).maybeSingle()
    const current = Number(data?.total_cost_usd ?? 0)
    const total = Math.round(((Number.isFinite(current) ? current : 0) + Math.max(0, addCostUsd)) * 1e6) / 1e6
    await supabase.from('assistant_conversations').update({ total_cost_usd: total, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', id)
  } catch {
    // cost display is informational
  }
}

export async function loadMessages(supabase: ServerClient, userId: string, conversationId: string): Promise<StoredMessageRow[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, seq, role, content, usage, created_at')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('seq', { ascending: true })
    .limit(2000)
  if (error) fail(error)
  return (data ?? []).map(r => ({
    id: String(r.id),
    seq: Number(r.seq),
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: r.content,
    usage: r.usage,
    created_at: String(r.created_at),
  }))
}

export async function appendMessage(supabase: ServerClient, m: {
  userId: string
  conversationId: string
  role: 'user' | 'assistant'
  content: unknown[]
  /** Questions and answers only (tool-result rows have none — the rate limit counts rows with a preview). */
  textPreview: string | null
  usage?: Record<string, unknown> | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .insert({
      user_id: m.userId,
      conversation_id: m.conversationId,
      role: m.role,
      content: m.content,
      text_preview: m.textPreview,
      usage: m.usage ?? null,
    })
    .select('id')
    .single()
  if (error || !data) fail(error)
  return String(data.id)
}

/** Timestamps of the user's questions since `sinceIso` (for the rolling rate limit). */
export async function recentQuestionTimes(supabase: ServerClient, userId: string, sinceIso: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('created_at')
    .eq('user_id', userId)
    .eq('role', 'user')
    .not('text_preview', 'is', null)
    .gte('created_at', sinceIso)
    .limit(500)
  if (error) fail(error)
  return (data ?? []).map(r => String(r.created_at))
}
