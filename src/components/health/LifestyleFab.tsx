'use client'

import { useState } from 'react'
import Link from 'next/link'
import BottomSheet from './ui/BottomSheet'
import FoodLogSheet, { type LogContext } from './FoodLogSheet'

export interface FabLinks { recent: string; weight: string; workout: string; cardio: string }

const TILE = 'flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-[var(--rule)] bg-white px-1 text-center text-xs font-semibold text-[var(--ink)] hover:border-[var(--blue-700)]'
const ICON = 'text-xl leading-none'

/**
 * Floating "+" on every Lifestyle tab (specs/032): Food · Photo · Upload · Barcode · Recent · Weight · Workout ·
 * Cardio/steps. Food options open the log sheet in place (Photo / Upload pick files inside the tap so the picker opens).
 */
export default function LifestyleFab({ ctx, links, initialOpen = false }: { ctx: LogContext; links: FabLinks; initialOpen?: boolean }) {
  const [menu, setMenu] = useState(initialOpen)
  const [log, setLog] = useState<{ files: File[]; scan: boolean } | null>(null)

  function openLog(files: File[] = [], scan = false) {
    setMenu(false)
    setLog({ files, scan })
  }
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) openLog(files)
  }

  return (
    <>
      <button
        type="button"
        aria-label="Add"
        onClick={() => setMenu(true)}
        className="fixed bottom-[calc(0.25rem+env(safe-area-inset-bottom))] left-[41.6667%] z-50 grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full bg-[var(--blue-700)] text-3xl font-light text-white shadow-lg md:bottom-8 md:left-auto md:right-8 md:h-14 md:w-14 md:translate-x-0"
      >
        +
      </button>
      <BottomSheet open={menu} onClose={() => setMenu(false)} title="Add">
        <div className="grid grid-cols-4 gap-2 pb-1">
          <button type="button" className={TILE} onClick={() => openLog()}><span aria-hidden="true" className={ICON}>✎</span>Food</button>
          <label className={TILE}>
            <span aria-hidden="true" className={ICON}>📷</span>Photo
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={pick} />
          </label>
          <label className={TILE}>
            <span aria-hidden="true" className={ICON}>⤒</span>Upload
            <input type="file" accept="image/*" multiple className="sr-only" onChange={pick} />
          </label>
          <button type="button" className={TILE} onClick={() => openLog([], true)}><span aria-hidden="true" className={ICON}>▦</span>Barcode</button>
          <Link href={links.recent} className={TILE} onClick={() => setMenu(false)}><span aria-hidden="true" className={ICON}>↺</span>Recent</Link>
          <Link href={links.weight} className={TILE} onClick={() => setMenu(false)}><span aria-hidden="true" className={ICON}>⚖</span>Weight</Link>
          <Link href={links.workout} className={TILE} onClick={() => setMenu(false)}><span aria-hidden="true" className={ICON}>🏋</span>Workout</Link>
          <Link href={links.cardio} className={TILE} onClick={() => setMenu(false)}><span aria-hidden="true" className={ICON}>👟</span>Cardio</Link>
        </div>
      </BottomSheet>
      {log && <FoodLogSheet open onClose={() => setLog(null)} ctx={ctx} initialFiles={log.files} startScan={log.scan} />}
    </>
  )
}
