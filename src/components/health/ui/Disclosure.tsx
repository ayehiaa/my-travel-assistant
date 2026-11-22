/** "Details" disclosure (native <details>): a 44 px summary row with title, optional meta, chevron. */
export default function Disclosure({ title, meta, children, open = false, id, className = '' }: {
  title: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; open?: boolean; id?: string; className?: string
}) {
  return (
    <details id={id} open={open} className={`group rounded-xl border border-[var(--rule)] bg-white ${className}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">{title}</span>
        {meta && <span className="shrink-0 text-xs text-[var(--ink-3)]">{meta}</span>}
        <span aria-hidden="true" className="shrink-0 text-[var(--ink-3)] transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="border-t border-[var(--rule-soft)] px-4 pb-4 pt-3">{children}</div>
    </details>
  )
}
