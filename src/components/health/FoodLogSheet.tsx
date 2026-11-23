'use client'

import { useState } from 'react'
import type { MealSlot } from '@/lib/health/programmeSchema'
import BottomSheet from './ui/BottomSheet'
import QuickLog from './QuickLog'

export interface LogContext {
  date: string
  nowTime: string
  slots: MealSlot[]
  componentLabels: Record<string, { name: string; unit: string }>
  eatingOut: string[]
}

/** The food logging sheet (text box + Photo / Upload / Barcode, chips, sticky Estimate → Save). */
export default function FoodLogSheet({ open, onClose, ctx, initialFiles, startScan }: {
  open: boolean; onClose: () => void; ctx: LogContext; initialFiles?: File[]; startScan?: boolean
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Log food">
      <QuickLog {...ctx} initialFiles={initialFiles} startScan={startScan} onSaved={onClose} />
    </BottomSheet>
  )
}

/** "Log food" primary button that opens the sheet. */
export function FoodLogButton({ ctx, className, label = 'Log food' }: { ctx: LogContext; className: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      <FoodLogSheet open={open} onClose={() => setOpen(false)} ctx={ctx} />
    </>
  )
}
