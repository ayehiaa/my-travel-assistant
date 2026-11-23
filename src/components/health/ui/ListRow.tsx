import Link from 'next/link'

/** Tappable list row (≥ 44 px): title, optional meta line, right-hand value, chevron. */
export default function ListRow({ href, title, meta, right, icon, chevron = true }: {
  href: string; title: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode; icon?: React.ReactNode; chevron?: boolean
}) {
  return (
    <Link href={href} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-[var(--paper-2)]">
      {icon && <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--blue-50)] text-[var(--blue-700)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--ink)]">{title}</span>
        {meta && <span className="block truncate text-xs text-[var(--ink-3)]">{meta}</span>}
      </span>
      {right && <span className="shrink-0 text-sm text-[var(--ink-2)]">{right}</span>}
      {chevron && <span aria-hidden="true" className="shrink-0 text-[var(--ink-3)]">›</span>}
    </Link>
  )
}

/** Card that groups rows with dividers. */
export function ListGroup({ title, children, id }: { title?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="overflow-hidden rounded-xl border border-[var(--rule)] bg-white">
      {title && <h2 className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">{title}</h2>}
      <div className="divide-y divide-[var(--rule-soft)]">{children}</div>
    </section>
  )
}
