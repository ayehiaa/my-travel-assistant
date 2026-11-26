'use client'

import { useState } from 'react'
import { formatCost } from '@/lib/assistant/usage'
import type { ConversationSummary } from './useAssistantChat'
import { PencilIcon, PlusIcon, TrashIcon } from './icons'
import Skeleton from '@/components/ui/Skeleton'

/** Conversation list for My Assistant (specs/033): desktop sidebar and mobile drawer content. */

function relDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
  if (days === 1) return 'Yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
}

export default function ConversationList({ conversations, activeId, ready, onOpen, onNew, onDelete, onRename }: {
  conversations: ConversationSummary[]
  activeId: string | null
  ready: boolean
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <button type="button" onClick={onNew} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--yellow)] text-sm font-semibold text-[var(--blue-900)] hover:brightness-95">
          <PlusIcon className="h-4 w-4" /> New chat
        </button>
      </div>
      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!ready && (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        )}
        {ready && conversations.length === 0 && <p className="px-2 py-3 text-sm text-[var(--ink-4)]">No chats yet.</p>}
        <ul className="space-y-0.5">
          {conversations.map(c => {
            const active = c.id === activeId
            return (
              <li key={c.id} className={`group relative rounded-lg ${active ? 'bg-[var(--blue-50)]' : 'hover:bg-[var(--paper-3)]'}`}>
                {editing === c.id ? (
                  <form
                    className="p-1"
                    onSubmit={e => {
                      e.preventDefault()
                      const t = draft.trim()
                      if (t) onRename(c.id, t.slice(0, 120))
                      setEditing(null)
                    }}
                  >
                    <label className="sr-only" htmlFor={`rename-${c.id}`}>Rename chat</label>
                    <input
                      id={`rename-${c.id}`}
                      autoFocus
                      value={draft}
                      maxLength={120}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={e => { if (e.key === 'Escape') setEditing(null) }}
                      className="h-9 w-full rounded-md border border-[var(--blue-500)] bg-[var(--paper)] px-2 text-sm focus:outline-none"
                    />
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      aria-current={active ? 'true' : undefined}
                      className="block w-full rounded-lg px-2.5 py-2 pr-16 text-left"
                    >
                      <span className={`block truncate text-sm ${active ? 'font-semibold text-[var(--blue-700)]' : 'text-[var(--ink-2)]'}`}>{c.title}</span>
                      <span className="block text-[11px] text-[var(--ink-4)]">{relDate(c.updatedAt)}{c.totalCostUsd > 0 ? ` · ${formatCost(c.totalCostUsd)}` : ''}</span>
                    </button>
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button type="button" aria-label={`Rename ${c.title}`} onClick={() => { setDraft(c.title); setEditing(c.id) }} className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-4)] hover:bg-[var(--paper)] hover:text-[var(--ink)]">
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={`Delete ${c.title}`} onClick={() => onDelete(c.id)} className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-4)] hover:bg-[var(--paper)] hover:text-[var(--coral)]">
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
