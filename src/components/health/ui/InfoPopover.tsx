/**
 * ⓘ button with a small panel (native <details>, no JS). On phones the panel is pinned above the bottom bar so it
 * never overflows the screen; on wider screens it opens under the button.
 */
export default function InfoPopover({ label = 'More info', children, align = 'right' }: { label?: string; children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <details className="group relative inline-block align-middle">
      <summary
        aria-label={label}
        className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full text-[var(--ink-3)] hover:text-[var(--blue-700)] [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-current text-[11px] font-bold">i</span>
      </summary>
      <div className={`fixed inset-x-4 bottom-24 z-50 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--rule)] bg-white p-3 text-left text-sm font-normal normal-case tracking-normal text-[var(--ink-2)] shadow-lg md:absolute md:inset-x-auto md:bottom-auto md:top-full md:w-80 ${align === 'right' ? 'md:right-0' : 'md:left-0'}`}>
        {children}
      </div>
    </details>
  )
}
