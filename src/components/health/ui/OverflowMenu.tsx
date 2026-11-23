/** "⋯" menu for secondary actions (native <details>; items are links or buttons passed as children). */
export default function OverflowMenu({ label = 'More actions', children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="relative inline-block">
      <summary aria-label={label} className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full text-xl leading-none text-[var(--ink-2)] hover:bg-[var(--paper-2)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className="fixed inset-x-4 bottom-24 z-50 flex flex-col gap-1 rounded-xl border border-[var(--rule)] bg-white p-2 text-sm shadow-lg md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:w-64">
        {children}
      </div>
    </details>
  )
}

export const MENU_ITEM = 'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-[var(--ink)] hover:bg-[var(--paper-2)] disabled:opacity-50'
