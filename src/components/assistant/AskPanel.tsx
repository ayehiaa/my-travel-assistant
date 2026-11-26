'use client'

import Link from 'next/link'
import { useEffect, useRef, type ComponentProps } from 'react'
import { formatCost } from '@/lib/assistant/usage'
import ChatView from './ChatView'
import { CloseIcon, ExpandIcon, PlusIcon, SparkleIcon } from './icons'

/** The "Ask" slide-over (specs/033): presentational dialog around ChatView. Esc closes; focus returns to the opener. */
export default function AskPanel({ open, onClose, onNew, chat, costUsd, fullPageHref }: {
  open: boolean
  onClose: () => void
  onNew: () => void
  chat: ComponentProps<typeof ChatView>
  costUsd: number
  fullPageHref: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Tab' && panelRef.current) {
        // Keep focus inside the dialog.
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="ask-panel-title">
      <button type="button" tabIndex={-1} aria-label="Close My Assistant" className="absolute inset-0 hidden bg-[rgba(10,31,77,.28)] md:block" onClick={onClose} />
      <div ref={panelRef} className="absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--paper-2)] shadow-[var(--shadow-lg)] md:w-[460px] md:border-l md:border-[var(--rule)]">
        <header className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--paper)] px-3 py-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--yellow)] text-[var(--blue-900)]"><SparkleIcon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="ask-panel-title" className="font-display text-base font-bold text-[var(--ink)]">My Assistant</h2>
            {costUsd > 0 && <p className="text-[11px] text-[var(--ink-4)]">This chat: {formatCost(costUsd)}</p>}
          </div>
          <button type="button" onClick={onNew} aria-label="New chat" title="New chat" className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]">
            <PlusIcon className="h-4 w-4" />
          </button>
          <Link href={fullPageHref} onClick={onClose} aria-label="Open full page" title="Open full page" className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]">
            <ExpandIcon className="h-4 w-4" />
          </Link>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-lg text-[var(--ink-3)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]">
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>
        <ChatView {...chat} />
      </div>
    </div>
  )
}
