'use client'

import { useEffect, useState, type ComponentProps } from 'react'
import { formatCost } from '@/lib/assistant/usage'
import ChatView from './ChatView'
import ConversationList from './ConversationList'
import { CloseIcon, MenuIcon, PlusIcon, SparkleIcon } from './icons'

/** Full-page layout for My Assistant (specs/033): sidebar (desktop) / drawer (mobile) + chat. Presentational. */

type ListProps = ComponentProps<typeof ConversationList>

export default function AssistantShell({ list, chat, title, costUsd }: {
  list: ListProps
  chat: ComponentProps<typeof ChatView>
  title: string | null
  costUsd: number
}) {
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const listWithClose: ListProps = {
    ...list,
    onOpen: id => { setDrawer(false); list.onOpen(id) },
    onNew: () => { setDrawer(false); list.onNew() },
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-62px)] w-full max-w-[1280px] min-h-0">
      <aside className="hidden w-[280px] shrink-0 border-r border-[var(--rule)] bg-[var(--paper)] md:block">
        <ConversationList {...list} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Chats">
          <button type="button" aria-label="Close chats" className="absolute inset-0 bg-[rgba(10,31,77,.35)]" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-[var(--paper)] shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-3 py-2">
              <span className="font-display text-base font-bold text-[var(--ink)]">Chats</span>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close chats" className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--paper-3)]">
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <ConversationList {...listWithClose} />
          </div>
        </div>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="My Assistant chat">
        <header className="flex items-center gap-2 border-b border-[var(--rule-soft)] bg-[var(--paper-2)] px-3 py-2 md:px-8">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Show chats" className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--paper-3)] md:hidden">
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="hidden h-8 w-8 place-items-center rounded-lg bg-[var(--yellow)] text-[var(--blue-900)] md:grid"><SparkleIcon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-bold text-[var(--ink)]">{title ?? 'My Assistant'}</h1>
            {costUsd > 0 && <p className="text-[11px] text-[var(--ink-4)]">This chat: {formatCost(costUsd)}</p>}
          </div>
          <button type="button" onClick={list.onNew} aria-label="New chat" className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--paper-3)] md:hidden">
            <PlusIcon className="h-5 w-5" />
          </button>
        </header>
        <ChatView {...chat} />
      </section>
    </div>
  )
}
