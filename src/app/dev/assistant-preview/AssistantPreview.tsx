'use client'

import { useState } from 'react'
import { deriveAccess } from '@/lib/access'
import { UserProvider } from '@/context/UserContext'
import Nav from '@/components/Nav'
import AssistantShell from '@/components/assistant/AssistantShell'
import AskPanel from '@/components/assistant/AskPanel'
import type { ChatViewProps } from '@/components/assistant/ChatView'
import { CONVERSATIONS, LIVE, LIVE_TOOLS_ONLY, MESSAGES } from './fixtures'

/** Client half of the dev-only preview: fixture props, no network. Buttons are no-ops. */

const ACCESS = deriveAccess({ account_type: 'member', plan: 'plus', features: ['portfolio', 'health'] })
const USER = {
  id: 'preview', email: 'preview@example.com', displayName: 'Alex Preview', access: ACCESS, activeMainAccountId: 'preview', linkedMainAccounts: [],
}

export type PreviewView = 'chat' | 'empty' | 'nokey' | 'tools' | 'panel'

export default function AssistantPreview({ view }: { view: PreviewView }) {
  const [panelOpen, setPanelOpen] = useState(true)
  const noop = () => {}
  const base: ChatViewProps = {
    variant: 'page', firstName: 'Alex', messages: [], live: null, streaming: false, loading: false, error: null,
    hasKey: true, migrationMissing: false, areas: ['travel', 'expenses', 'lifestyle', 'trading'], onSend: noop, onStop: noop, onRetry: noop,
  }
  const list = { conversations: CONVERSATIONS, activeId: null as string | null, ready: true, onOpen: noop, onNew: noop, onDelete: noop, onRename: noop }

  let chat: ChatViewProps = base
  let title: string | null = null
  let cost = 0
  if (view === 'chat') {
    chat = { ...base, messages: MESSAGES, live: LIVE, streaming: true }
    list.activeId = 'c1'
    title = CONVERSATIONS[0].title
    cost = CONVERSATIONS[0].totalCostUsd
  } else if (view === 'tools') {
    chat = { ...base, messages: [{ id: 'u', role: 'user', text: 'Am I on track for protein today?', createdAt: '2026-11-26T12:00:00Z' }], live: LIVE_TOOLS_ONLY, streaming: true }
  } else if (view === 'nokey') {
    chat = {
      ...base, hasKey: false,
      keySlot: <div className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-4 text-sm text-[var(--ink-3)]">[Anthropic API key card renders here]</div>,
    }
  }

  return (
    <UserProvider user={USER}>
      <Nav />
      {view === 'panel' ? (
        <div className="mx-auto max-w-[960px] p-6">
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Expenses</h1>
          <p className="mt-2 text-sm text-[var(--ink-3)]">The slide-over opens on top of any page (⌘K / Ctrl+K).</p>
          <button type="button" className="mt-4 rounded-lg bg-[var(--blue-700)] px-3 py-2 text-sm font-semibold text-white" onClick={() => setPanelOpen(true)}>Open panel</button>
          <AskPanel
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            onNew={noop}
            costUsd={0}
            fullPageHref="/assistant"
            chat={{ ...base, variant: 'panel', preferredArea: 'expenses' }}
          />
        </div>
      ) : (
        <AssistantShell list={list} chat={chat} title={title} costUsd={cost} />
      )}
    </UserProvider>
  )
}
