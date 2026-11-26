'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { areaForPath } from '@/lib/assistant/areas'
import AskPanel from './AskPanel'
import { SparkleIcon } from './icons'
import { useAssistantChat } from './useAssistantChat'

/**
 * The top-nav "Ask" button + ⌘K / Ctrl+K shortcut that opens My Assistant as a slide-over on any page (specs/033).
 * The chat state lives as long as the nav does, so a conversation continues across page changes.
 * Hidden on /assistant itself (the full page is already open).
 */
export default function AskLauncher({ firstName, variant }: { firstName: string; variant: 'desktop' | 'mobile' }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Mounted on first open and kept afterwards, so closing and re-opening continues the same chat.
  const [started, setStarted] = useState(false)
  const onAssistantPage = pathname?.startsWith('/assistant') ?? false
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (variant !== 'desktop') return // one shortcut listener (the desktop instance is always mounted)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        if (window.location.pathname.startsWith('/assistant')) return
        e.preventDefault()
        setStarted(true)
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  if (onAssistantPage) return null
  return (
    <>
      <button
        type="button"
        onClick={() => { setStarted(true); setOpen(true) }}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        title="Ask My Assistant (⌘K / Ctrl+K)"
        className={variant === 'desktop'
          ? 'inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--yellow)] px-3.5 text-[13px] font-bold text-[var(--blue-900)] hover:brightness-95'
          : 'grid h-10 w-10 place-items-center rounded-full bg-[var(--yellow)] text-[var(--blue-900)]'}
        aria-label={variant === 'mobile' ? 'Ask My Assistant' : undefined}
      >
        <SparkleIcon className="h-4 w-4" />
        {variant === 'desktop' && <span>Ask</span>}
      </button>
      {started && <AskSession open={open} firstName={firstName} preferred={areaForPath(pathname)} onClose={close} />}
    </>
  )
}

/** Mounted on first open (the conversation list is fetched on first use, not on every page load). */
function AskSession({ open, firstName, preferred, onClose }: { open: boolean; firstName: string; preferred: ReturnType<typeof areaForPath>; onClose: () => void }) {
  const chat = useAssistantChat()
  const s = chat.state
  const active = s.conversations.find(c => c.id === s.activeId) ?? null
  return (
    <AskPanel
      open={open}
      onClose={onClose}
      onNew={chat.newChat}
      costUsd={active?.totalCostUsd ?? 0}
      fullPageHref="/assistant"
      chat={{
        variant: 'panel',
        firstName,
        messages: s.messages,
        live: s.live,
        streaming: s.streaming,
        loading: !s.ready || s.loadingMessages,
        error: s.error,
        hasKey: s.hasKey,
        migrationMissing: s.migrationMissing,
        areas: s.areas,
        preferredArea: preferred,
        onSend: t => void chat.send(t),
        onStop: chat.stop,
        onRetry: chat.retry,
        autoFocus: true,
      }}
    />
  )
}
