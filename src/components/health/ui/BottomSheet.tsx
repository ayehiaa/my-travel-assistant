'use client'

import { useEffect, useId, useState } from 'react'

/**
 * Bottom sheet (phones) / centred dialog (desktop). Escape or the backdrop closes it. `footer` stays visible at the
 * bottom (sticky primary action in the thumb zone).
 */
export default function BottomSheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode
}) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-lg md:max-w-lg md:rounded-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-soft)] py-1 pl-4 pr-1">
          <h2 id={id} className="truncate text-base font-bold text-[var(--ink)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-xl text-[var(--ink-3)] hover:bg-[var(--paper-2)]">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-[var(--rule-soft)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

/** A trigger that opens a sheet with server-rendered content (e.g. a food entry's details). */
export function SheetTrigger({ title, trigger, triggerClassName = '', triggerLabel, children, defaultOpen = false }: {
  title: string; trigger: React.ReactNode; triggerClassName?: string; triggerLabel?: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <>
      <button type="button" aria-label={triggerLabel} className={triggerClassName} onClick={() => setOpen(true)}>{trigger}</button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title}>{children}</BottomSheet>
    </>
  )
}
