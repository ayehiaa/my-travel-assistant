import type Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { resolveAiKeyForUser } from '@/lib/aiKeyStore'
import { NO_AI_KEY_MESSAGE } from '@/lib/aiKeyResolver'
import { enabledAreas } from '@/lib/assistant/areas'
import { ASSISTANT_MIGRATION_MESSAGE, MAX_MESSAGE_CHARS, RATE_LIMITED_MESSAGE } from '@/lib/assistant/config'
import { AbortedByClient, loopErrorMessage, runChatLoop } from '@/lib/assistant/chatLoop'
import { answerText, danglingToolUseIds, notRunResults } from '@/lib/assistant/loopControl'
import { toApiMessages } from '@/lib/assistant/history'
import { rateDecision, rateWindowStart } from '@/lib/assistant/rateLimit'
import { encodeSse, type AssistantEvent } from '@/lib/assistant/sse'
import {
  AssistantStoreError, appendMessage, createConversation, getConversation, loadMessages, recentQuestionTimes, touchConversation,
} from '@/lib/assistant/store'
import { buildContextBlock, makeTitle, previewText } from '@/lib/assistant/text'
import { ASSISTANT_TIMEZONE, dataScope } from '@/lib/assistant/session'

/**
 * POST /api/assistant/chat — My Assistant (specs/033). Streams Server-Sent Events:
 * conversation {id,title} · status {tool,label} · text {delta,reset?} · done {messageId,usage,costUsd,toolsUsed} · error {message}.
 * The user message is stored before Claude is called and each assistant turn right after it completes, so a dropped
 * stream keeps the history. A client abort aborts the Anthropic stream.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

const BodySchema = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().trim().min(1, 'Type a question first').max(MAX_MESSAGE_CHARS, `Keep questions under ${MAX_MESSAGE_CHARS} characters`),
})

const INTERRUPTED = 'Not run: the previous request was stopped before this lookup finished.'

function storeErrorResponse(err: unknown) {
  if (err instanceof AssistantStoreError && err.migrationMissing) {
    return NextResponse.json({ error: ASSISTANT_MIGRATION_MESSAGE, code: 'migration_missing' }, { status: 503 })
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 })
  const { message: question, conversationId } = parsed.data

  const key = await resolveAiKeyForUser(user.id).catch(() => null)
  if (!key) return NextResponse.json({ error: 'Could not check your Anthropic key — try again shortly' }, { status: 500 })
  if (!key.ok) return NextResponse.json({ error: NO_AI_KEY_MESSAGE, code: 'no_ai_key' }, { status: 400 })

  const supabase = await createClient()
  const now = new Date()

  let conversation
  let history
  try {
    const decision = rateDecision(await recentQuestionTimes(supabase, user.id, rateWindowStart(now)), now)
    if (!decision.allowed) {
      return NextResponse.json({ error: RATE_LIMITED_MESSAGE, code: 'rate_limited', retryAfterMs: decision.retryAfterMs }, { status: 429 })
    }
    if (conversationId) {
      conversation = await getConversation(supabase, user.id, conversationId)
      if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      history = toApiMessages(await loadMessages(supabase, user.id, conversation.id))
    } else {
      // Areas are frozen per conversation so every request sends the same tools (stable prefix for thinking + cache).
      conversation = await createConversation(supabase, user.id, makeTitle(question), enabledAreas(user.access))
      history = [] as Anthropic.Beta.BetaMessageParam[]
    }
  } catch (err) {
    return storeErrorResponse(err)
  }

  const scope = await dataScope(supabase, user)
  const areas = conversation.areas

  // Persist before calling Claude. Calls left without results by an earlier aborted request are answered first
  // (appended, never edited) so the history stays valid.
  try {
    const dangling = danglingToolUseIds(history)
    if (dangling.length) {
      const results = notRunResults(dangling.map(id => ({ id })), INTERRUPTED)
      await appendMessage(supabase, { userId: user.id, conversationId: conversation.id, role: 'user', content: results, textPreview: null })
      history.push({ role: 'user', content: results })
    }
    const userContent: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: buildContextBlock({ now, timeZone: ASSISTANT_TIMEZONE, areas, accountType: user.access.accountType, viewingName: scope.viewingName }) },
      { type: 'text', text: question },
    ]
    await appendMessage(supabase, { userId: user.id, conversationId: conversation.id, role: 'user', content: userContent, textPreview: previewText(question) })
    history.push({ role: 'user', content: userContent })
  } catch (err) {
    return storeErrorResponse(err)
  }

  const abort = new AbortController()
  const onClientAbort = () => abort.abort()
  request.signal.addEventListener('abort', onClientAbort)
  const encoder = new TextEncoder()
  const conv = conversation

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (e: AssistantEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(encodeSse(e)))
        } catch {
          open = false
        }
      }
      send({ event: 'conversation', data: { id: conv.id, title: conv.title } })
      let costUsd = 0
      try {
        const result = await runChatLoop({
          apiKey: key.apiKey,
          areas,
          messages: history,
          signal: abort.signal,
          toolCtx: {
            supabase, userId: user.id, dataOwnerId: scope.dataOwnerId, access: user.access, areas,
            timeZone: ASSISTANT_TIMEZONE, now, viewingName: scope.viewingName,
          },
          io: {
            onText: (delta, reset) => send({ event: 'text', data: reset ? { delta: '', reset: true } : { delta } }),
            onStatus: (tool, label) => send({ event: 'status', data: { tool, label } }),
            saveAssistant: async (content, usage) => {
              costUsd += typeof usage.cost_usd === 'number' ? usage.cost_usd : 0
              const text = answerText(content as Array<{ type: string; text?: unknown }>)
              return appendMessage(supabase, {
                userId: user.id, conversationId: conv.id, role: 'assistant', content, usage,
                textPreview: text ? previewText(text) : null,
              })
            },
            saveToolResults: async results => {
              await appendMessage(supabase, { userId: user.id, conversationId: conv.id, role: 'user', content: results, textPreview: null })
            },
          },
        })
        send({
          event: 'done',
          data: {
            messageId: result.messageId, usage: result.usage, costUsd: result.costUsd, toolsUsed: result.toolsUsed,
            ...(result.refused ? { refused: true } : {}), ...(result.notice ? { notice: result.notice } : {}),
          },
        })
      } catch (err) {
        if (!(err instanceof AbortedByClient)) {
          const e = err instanceof AssistantStoreError
            ? { message: err.migrationMissing ? ASSISTANT_MIGRATION_MESSAGE : 'Could not save the conversation — try again.', code: 'store' }
            : loopErrorMessage(err)
          send({ event: 'error', data: e })
        }
      } finally {
        await touchConversation(supabase, user.id, conv.id, costUsd)
        request.signal.removeEventListener('abort', onClientAbort)
        if (open) {
          open = false
          try {
            controller.close()
          } catch {
            // already closed by the client
          }
        }
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  })
}
