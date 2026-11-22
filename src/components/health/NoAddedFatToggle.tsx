'use client'

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  /** Restaurant mode: shown as a prominent card instead of a plain checkbox. */
  prominent?: boolean
}

/** "Cooked/served without butter or oil" (specs/029 P3.1): no added-fat assumptions in the estimate. */
export default function NoAddedFatToggle({ checked, onChange, prominent = false }: Props) {
  return (
    <label
      className={prominent
        ? `flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-green-300 bg-green-50 text-green-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`
        : 'flex items-center gap-2 text-sm text-[var(--ink-2)]'}
    >
      <input type="checkbox" className={prominent ? 'mt-0.5' : ''} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        Cooked/served without butter or oil
        {prominent && <span className="block text-xs opacity-80">Tick only if you asked for it — otherwise likely hidden fat is shown as removable chips.</span>}
      </span>
    </label>
  )
}
