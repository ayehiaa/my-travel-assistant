'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantArea } from '@/lib/assistant/areas'
import type { UiAssistantMessage, UiMessage } from '@/lib/assistant/history'
import { parseSse } from '@/lib/assistant/sse'
import { splitFollowUps } from '@/lib/assistant/text'
import { GENERIC_ERROR_MESSAGE } from '@/lib/assistant/config'

/**
 * My Assistant (specs/033) — client state for one chat surface (full page or slide-over): conversation list, messages,
 * the streaming answer (SSE from POST /api/assistant/chat), stop / retry, rename / delete.
 */

export interface ConversationSummary {
  id: string
  title: string
  totalCostUsd: number
  updatedAt: string
}

export interface LiveAnswer {
  text: string
  tools: Array<{ tool: string; label: string }>
}

export interface ChatState {
  ready: boolean
  hasKey: boolean
  migrationMissing: boolean
  areas: AssistantArea[]
  conversations: ConversationSummary[]
  activeId: string | null
  messages: UiMessage[]
  loadingMessages: boolean
  live: LiveAnswer | null
  streaming: boolean
  error: string | null
  lastQuestion: string | null
}

const INITIAL: ChatState = {
  ready: false, hasKey: true, migrationMissing: false, areas: [], conversations: [], activeId: null, messages: [],
  loadingMessages: false, live: null, streaming: false, error: null, lastQuestion: null,
}

async function fetchMeta(): Promise<Partial<ChatState>> {
  try {
    const res = await fetch('/api/assistant/conversations', { cache: 'no-store' })
    if (!res.ok) throw new Error()
    const json = await res.json() as { hasKey: boolean; areas: AssistantArea[]; migrationMissing: boolean; conversations: ConversationSummary[] }
    return { ready: true, hasKey: json.hasKey, areas: json.areas, migrationMissing: json.migrationMissing, conversations: json.conversations }
  } catch {
    return { ready: true, error: 'Could not load your conversations — try again shortly.' }
  }
}

let tmpCounter = 0
const tmpId = (p: string) => `${p}-${Date.now()}-${++tmpCounter}`

export function useAssistantChat() {
  const [state, setState] = useState<ChatState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const liveRef = useRef<{ text: string; turnBase: number; tools: LiveAnswer['tools'] }>({ text: '', turnBase: 0, tools: [] })
  const activeRef = useRef<string | null>(null)
  activeRef.current = state.activeId

  const loadMeta = useCallback(async () => {
    const meta = await fetchMeta()
    setState(s => ({ ...s, ...meta }))
  }, [])

  useEffect(() => {
    // Initial load of the conversation list; state is set in the fetch callback.
    let cancelled = false
    fetchMeta().then(meta => {
      if (!cancelled) setState(s => ({ ...s, ...meta }))
    })
    return () => { cancelled = true }
  }, [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    setState(s => ({ ...s, activeId: null, messages: [], live: null, streaming: false, error: null, lastQuestion: null }))
  }, [])

  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort()
    setState(s => ({ ...s, activeId: id, messages: [], live: null, streaming: false, error: null, loadingMessages: true }))
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const json = await res.json() as { messages: UiMessage[] }
      if (activeRef.current !== id) return
      setState(s => ({ ...s, messages: json.messages, loadingMessages: false }))
    } catch {
      setState(s => ({ ...s, loadingMessages: false, error: 'Could not open that conversation.' }))
    }
  }, [])

  const finishLive = useCallback((extra: Partial<UiAssistantMessage>) => {
    const { body, followUps } = splitFollowUps(liveRef.current.text)
    const msg: UiAssistantMessage = {
      id: tmpId('a'), role: 'assistant', text: body, followUps, tools: liveRef.current.tools.map(t => t.tool),
      refused: false, notice: null, costUsd: 0, createdAt: new Date().toISOString(), ...extra,
    }
    setState(s => ({ ...s, live: null, streaming: false, messages: msg.text || msg.refused || msg.notice ? [...s.messages, msg] : s.messages }))
  }, [])

  const send = useCallback(async (raw: string) => {
    const question = raw.trim()
    if (!question || abortRef.current) return
    const ac = new AbortController()
    abortRef.current = ac
    liveRef.current = { text: '', turnBase: 0, tools: [] }
    const userMsg: UiMessage = { id: tmpId('u'), role: 'user', text: question, createdAt: new Date().toISOString() }
    setState(s => ({ ...s, messages: [...s.messages, userMsg], live: { text: '', tools: [] }, streaming: true, error: null, lastQuestion: question }))

    let finished = false
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeRef.current, message: question }),
        signal: ac.signal,
      })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({})) as { error?: string; code?: string }
        setState(s => ({
          ...s, live: null, streaming: false, error: json.error ?? GENERIC_ERROR_MESSAGE,
          hasKey: json.code === 'no_ai_key' ? false : s.hasKey,
          migrationMissing: json.code === 'migration_missing' ? true : s.migrationMissing,
        }))
        finished = true
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parsed = parseSse(buffer)
        buffer = parsed.rest
        for (const e of parsed.events) {
          if (e.event === 'conversation') {
            const { id, title } = e.data
            activeRef.current = id
            setState(s => ({
              ...s,
              activeId: id,
              conversations: s.conversations.some(c => c.id === id)
                ? s.conversations.map(c => (c.id === id ? { ...c, updatedAt: new Date().toISOString() } : c))
                : [{ id, title, totalCostUsd: 0, updatedAt: new Date().toISOString() }, ...s.conversations],
            }))
          } else if (e.event === 'status') {
            const live = liveRef.current
            live.turnBase = live.text.length
            live.tools = [...live.tools, e.data]
            setState(s => ({ ...s, live: { text: live.text, tools: live.tools } }))
          } else if (e.event === 'text') {
            const live = liveRef.current
            live.text = e.data.reset ? live.text.slice(0, live.turnBase) : live.text + e.data.delta
            setState(s => ({ ...s, live: { text: live.text, tools: live.tools } }))
          } else if (e.event === 'done') {
            finished = true
            const { refused, notice, costUsd, messageId } = e.data
            finishLive({ id: messageId ?? tmpId('a'), refused: !!refused, notice: notice ?? null, costUsd, ...(refused ? { text: '', followUps: [] } : {}) })
            setState(s => ({
              ...s,
              conversations: s.conversations.map(c => (c.id === activeRef.current ? { ...c, totalCostUsd: c.totalCostUsd + costUsd } : c)),
            }))
          } else if (e.event === 'error') {
            finished = true
            setState(s => ({ ...s, live: null, streaming: false, error: e.data.message }))
          }
        }
      }
      if (!finished) setState(s => ({ ...s, live: null, streaming: false, error: 'The connection dropped — what arrived so far was saved. Try again.' }))
    } catch {
      if (ac.signal.aborted) {
        finishLive({ notice: 'Stopped.' })
      } else {
        setState(s => ({ ...s, live: null, streaming: false, error: 'Could not reach My Assistant — check your connection and try again.' }))
      }
    } finally {
      abortRef.current = null
    }
  }, [finishLive])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const retry = useCallback(() => {
    if (state.lastQuestion) void send(state.lastQuestion)
  }, [send, state.lastQuestion])

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/assistant/conversations/${id}`, { method: 'DELETE' })
    if (!res.ok) return false
    setState(s => ({
      ...s,
      conversations: s.conversations.filter(c => c.id !== id),
      ...(s.activeId === id ? { activeId: null, messages: [], live: null, error: null } : {}),
    }))
    return true
  }, [])

  const rename = useCallback(async (id: string, title: string) => {
    const res = await fetch(`/api/assistant/conversations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    })
    if (!res.ok) return false
    setState(s => ({ ...s, conversations: s.conversations.map(c => (c.id === id ? { ...c, title } : c)) }))
    return true
  }, [])

  return { state, send, stop, retry, newChat, openConversation, remove, rename, reload: loadMeta }
}

