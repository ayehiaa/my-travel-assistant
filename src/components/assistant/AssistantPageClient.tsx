'use client'

import type { ReactNode } from 'react'
import { useToast } from '@/context/ToastContext'
import AssistantShell from './AssistantShell'
import { useAssistantChat } from './useAssistantChat'

/** /assistant — wires the chat state to the full-page layout (specs/033). */
export default function AssistantPageClient({ firstName, keySlot, serverHasKey }: { firstName: string; keySlot: ReactNode; serverHasKey: boolean }) {
  const chat = useAssistantChat()
  const toast = useToast()
  const s = chat.state
  const active = s.conversations.find(c => c.id === s.activeId) ?? null

  return (
    <AssistantShell
      title={active?.title ?? null}
      costUsd={active?.totalCostUsd ?? 0}
      list={{
        conversations: s.conversations,
        activeId: s.activeId,
        ready: s.ready,
        onOpen: id => void chat.openConversation(id),
        onNew: chat.newChat,
        onDelete: async id => {
          if (!window.confirm('Delete this chat? This cannot be undone.')) return
          if (!(await chat.remove(id))) toast('Could not delete the chat', 'error')
        },
        onRename: async (id, title) => {
          if (!(await chat.rename(id, title))) toast('Could not rename the chat', 'error')
        },
      }}
      chat={{
        variant: 'page',
        firstName,
        messages: s.messages,
        live: s.live,
        streaming: s.streaming,
        loading: !s.ready || s.loadingMessages,
        error: s.error,
        // The key card refreshes the page after saving: trust the server's answer as soon as it says yes.
        hasKey: s.hasKey || serverHasKey,
        migrationMissing: s.migrationMissing,
        areas: s.areas,
        onSend: t => void chat.send(t),
        onStop: chat.stop,
        onRetry: chat.retry,
        keySlot,
        autoFocus: true,
      }}
    />
  )
}
