'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { PORTION_FACTORS, scaleItem, sumNutrients, uncertaintyBand, type FoodItem } from '@/lib/health/nutrition'
import { applyOffProduct, type OffProduct } from '@/lib/health/openFoodFacts'
import { BUTTON_SECONDARY, INPUT, fmtNum } from './ui'
import BarcodeScanner from './BarcodeScanner'

export interface EditableItem extends FoodItem {
  /** Quantity of the original estimate (portion presets scale from it). */
  baseQuantityG: number
  remember: boolean
}

export function toEditable(items: FoodItem[]): EditableItem[] {
  return items.map(i => ({ ...i, baseQuantityG: i.quantityG, remember: i.source === 'manual' }))
}

export function fromEditable(items: EditableItem[]): { items: FoodItem[]; remember: number[] } {
  return {
    items: items.map(({ baseQuantityG: _b, remember: _r, ...rest }) => { void _b; void _r; return rest }),
    remember: items.map((i, idx) => (i.remember ? idx : -1)).filter(i => i >= 0),
  }
}

const BLANK: FoodItem = {
  name: '', quantityG: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, satFatG: 0, fibreG: 0,
  components: {}, confidence: 'high', isTreat: false, source: 'manual', libraryId: null, offCode: null,
}

const NUTRIENTS: Array<{ key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'satFatG' | 'fibreG'; label: string }> = [
  { key: 'kcal', label: 'kcal' }, { key: 'proteinG', label: 'Protein g' }, { key: 'satFatG', label: 'Sat fat g' },
  { key: 'carbsG', label: 'Carbs g' }, { key: 'fatG', label: 'Fat g' }, { key: 'fibreG', label: 'Fibre g' },
]

interface Props {
  items: EditableItem[]
  onChange: (items: EditableItem[]) => void
  componentLabels: Record<string, { name: string; unit: string }>
}

/** Editable list of food items (specs/029 US3): portions, values, components, remember in my foods. */
export default function FoodItemsEditor({ items, onChange, componentLabels }: Props) {
  const toast = useToast()
  const [open, setOpen] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OffProduct[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [scan, setScan] = useState(false)

  const update = (idx: number, next: EditableItem) => onChange(items.map((it, i) => (i === idx ? { ...next, remember: true } : it)))
  const totals = sumNutrients(items)
  const band = uncertaintyBand(totals.kcal)

  async function search() {
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const res = await fetch(`/api/health/foods/search?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Search failed', 'error'); return }
      setResults(data.products ?? [])
    } catch {
      toast('Network error — search failed', 'error')
    } finally {
      setSearching(false)
    }
  }

  function addProduct(p: OffProduct) {
    const item = applyOffProduct({ ...BLANK, quantityG: p.servingG ?? 100 }, p)
    onChange([...items, { ...item, baseQuantityG: item.quantityG, remember: true }])
    setResults(null)
    setQuery('')
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => {
        const low = item.confidence === 'low'
        const comps = Object.entries(item.components).filter(([, v]) => v > 0)
        return (
          <div key={idx} className={`rounded-lg border p-3 ${low ? 'border-amber-300 bg-amber-50' : 'border-[var(--rule)]'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Food name"
                className={`${INPUT} min-w-0 flex-1`}
                value={item.name}
                onChange={e => update(idx, { ...item, name: e.target.value })}
                placeholder="Food"
              />
              <label className="flex items-center gap-1 text-sm text-[var(--ink-2)]">
                <input
                  aria-label="Quantity in grams"
                  className={`${INPUT} w-20`}
                  inputMode="decimal"
                  key={`q-${idx}-${item.quantityG}`}
                  defaultValue={item.quantityG}
                  onBlur={e => {
                    const q = Number(e.target.value.replace(',', '.'))
                    if (q === item.quantityG) return
                    if (Number.isFinite(q) && q >= 0) update(idx, item.quantityG > 0 ? scaleItem(item, q) : { ...item, quantityG: q })
                  }}
                />
                g
              </label>
              <button type="button" aria-label={`Remove ${item.name || 'item'}`} className="px-2 text-lg text-[var(--ink-3)]" onClick={() => onChange(items.filter((_, i) => i !== idx))}>×</button>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--ink-2)]">
              <span><strong className="text-[var(--ink)]">{Math.round(item.kcal)}</strong> kcal</span>
              <span>P {fmtNum(item.proteinG)} g</span>
              <span>Sat fat {fmtNum(item.satFatG)} g</span>
              {comps.map(([k, v]) => (
                <span key={k} className="rounded-full bg-green-50 px-2 py-0.5 text-green-800">
                  {componentLabels[k]?.name ?? k.replace(/_/g, ' ')} {fmtNum(v)}{componentLabels[k]?.unit === 'servings' ? '' : ` ${componentLabels[k]?.unit ?? ''}`}
                </span>
              ))}
              <span className={low ? 'font-bold text-amber-800' : ''}>{item.source === 'library' ? 'My food' : item.source === 'off' ? 'Label values' : `${item.confidence} confidence`}</span>
              {item.isTreat && <span className="rounded-full bg-pink-50 px-2 py-0.5 text-pink-800">treat</span>}
            </div>
            {low && item.baseQuantityG > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-amber-900">Portion?</span>
                {(Object.keys(PORTION_FACTORS) as Array<keyof typeof PORTION_FACTORS>).map(size => (
                  <button
                    key={size}
                    type="button"
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 font-semibold capitalize text-amber-900"
                    onClick={() => update(idx, { ...scaleItem(item, Math.round(item.baseQuantityG * PORTION_FACTORS[size])), confidence: 'medium' })}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-xs font-semibold text-[var(--blue-700)] underline" onClick={() => setOpen(open === idx ? null : idx)}>
                {open === idx ? 'Hide values' : 'Edit values'}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
                <input type="checkbox" checked={item.remember} onChange={e => onChange(items.map((it, i) => (i === idx ? { ...it, remember: e.target.checked } : it)))} />
                Remember in my foods
              </label>
            </div>
            {open === idx && (
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {NUTRIENTS.map(n => (
                  <label key={n.key} className="text-[11px] text-[var(--ink-3)]">
                    {n.label}
                    <input
                      className={INPUT}
                      inputMode="decimal"
                      key={`${n.key}-${idx}-${item[n.key]}`}
                      defaultValue={item[n.key]}
                      onBlur={e => {
                        const v = Number(e.target.value.replace(',', '.'))
                        if (v === item[n.key]) return
                        if (Number.isFinite(v) && v >= 0) update(idx, { ...item, [n.key]: v, source: item.source === 'ai' ? 'manual' : item.source, confidence: 'high' })
                      }}
                    />
                  </label>
                ))}
                <label className="col-span-3 flex items-center gap-1.5 text-xs text-[var(--ink-2)] sm:col-span-6">
                  <input type="checkbox" checked={item.isTreat} onChange={e => update(idx, { ...item, isTreat: e.target.checked })} /> Treat
                </label>
              </div>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON_SECONDARY} onClick={() => onChange([...items, { ...BLANK, baseQuantityG: 100, remember: true }])}>+ Add item</button>
        <input
          aria-label="Search packaged foods"
          className={`${INPUT} min-w-0 flex-1`}
          placeholder="Search packaged food (Open Food Facts)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search() } }}
        />
        <button type="button" className={BUTTON_SECONDARY} disabled={searching || query.trim().length < 2} onClick={search}>{searching ? '…' : 'Search'}</button>
        <button type="button" className={BUTTON_SECONDARY} onClick={() => setScan(true)}>Scan barcode</button>
      </div>
      {scan && <BarcodeScanner onAdd={item => onChange([...items, { ...item, baseQuantityG: item.quantityG, remember: true }])} onClose={() => setScan(false)} />}
      {results && (
        <ul className="m-0 max-h-56 list-none overflow-y-auto rounded-lg border border-[var(--rule)] p-0">
          {results.length === 0 && <li className="p-3 text-sm text-[var(--ink-3)]">No match — add the item by hand.</li>}
          {results.map(p => (
            <li key={p.code}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--paper-2)]" onClick={() => addProduct(p)}>
                <strong>{p.name}</strong>{p.brand ? ` · ${p.brand}` : ''}
                <span className="block text-xs text-[var(--ink-3)]">per 100 g: {p.per100.kcal} kcal · P {p.per100.proteinG} g · sat fat {p.per100.satFatG} g</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <p className="text-sm text-[var(--ink-2)]">
          Total <strong className="text-[var(--ink)]">{totals.kcal} kcal</strong> ({band.low}–{band.high}, ±15%) · P {fmtNum(totals.proteinG)} g · sat fat {fmtNum(totals.satFatG)} g
        </p>
      )}
    </div>
  )
}
