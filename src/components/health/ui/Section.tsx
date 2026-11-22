/** Plain section with a ≤3-word heading and an optional right-hand slot (ⓘ, link, ⋯). */
export default function Section({ title, right, children, id, className = '' }: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; id?: string; className?: string
}) {
  return (
    <section id={id} className={`rounded-xl border border-[var(--rule)] bg-white p-4 ${className}`} aria-label={title}>
      {(title || right) && (
        <div className="-mt-1 mb-2 flex min-h-11 items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold text-[var(--ink)]">{title}</h2>}
          {right && <div className="flex items-center">{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export const PRIMARY_BTN = 'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--blue-700)] px-5 text-sm font-bold text-white disabled:opacity-50'
export const SECONDARY_BTN = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--rule)] bg-white px-4 text-sm font-semibold text-[var(--ink)] disabled:opacity-50'
export const SMALL_BTN = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--rule)] bg-white px-3 text-xs font-bold text-[var(--ink)] disabled:opacity-50'
export const LINK_BTN = 'inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue-700)]'
