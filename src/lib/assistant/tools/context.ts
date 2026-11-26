import type { Access } from '@/lib/access'
import type { AssistantArea } from '../areas'
import type { ServerClient } from '../store'

/** Everything a tool executor may use. Built server-side from the authenticated session — never from model input. */
export interface ToolContext {
  supabase: ServerClient
  /** The signed-in user (lifestyle + trading data, AI key, conversations). */
  userId: string
  /** Whose travel and expenses are read: the user, or for assistant accounts the active linked member. */
  dataOwnerId: string
  access: Access
  /** Areas declared for this conversation (frozen at creation). Access is still re-checked on every call. */
  areas: readonly AssistantArea[]
  timeZone: string
  now: Date
  viewingName: string | null
}

/** A short, safe error the model may see (never stack traces or secrets). */
export class ToolError extends Error {}
