'use client'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  /** Restaurant mode: shown as a prominent card instead of a plain checkbox. */
  prominent?: boolean
  /** Compact toggle chip (log sheet). */
  chip?: boolean
}

/** "Cooked/served without butter or oil" (specs/029 P3.1): no added-fat assumptions in the estimate. */
export default function NoAddedFatToggle({ checked, onChange, prominent = false, chip = false }: Props) {
  if (chip) {
    return (
      <button
        type="button"
        aria-pressed={checked}
        title="Cooked/served without butter or oil — no hidden-fat chips"
        onClick={() => onChange(!checked)}
        className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold ${checked ? 'border-green-700 bg-green-50 text-green-800' : 'border-[var(--rule)] bg-white text-[var(--ink-2)]'}`}
      >
        {checked ? '✓ ' : ''}No butter/oil
      </button>
    )
  }
  return (
    <label
      className={prominent
        ? `flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`
        : 'flex min-h-11 items-center gap-2 text-sm text-[var(--ink-2)]'}
    >
      <input type="checkbox" className={prominent ? 'mt-0.5' : ''} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        No butter or oil
        {prominent && <span className="block text-xs opacity-80">Tick only if you asked for it.</span>}
      </span>
    </label>
  )
}
