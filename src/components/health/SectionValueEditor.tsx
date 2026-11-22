'use client'

import { useState } from 'react'
import { ENUM_HINTS, ITEM_TEMPLATES, OBJECT_TEMPLATES, sectionMeta, type SectionKey, type SectionValue } from '@/lib/health/programmeImport'
import { BUTTON_SECONDARY, INPUT } from './ui'

/**
 * Generic structured editor for one programme section (import review + programme edit, specs/029 US1). Objects become
 * field groups, lists of items become cards (add / remove / reorder), text lists become one-per-line boxes, numeric
 * pairs become "a, b" inputs. Every section also has an "Edit as JSON" escape hatch for fields not shown.
 */

type Json = unknown

const LONG_TEXT = new Set(['description', 'disclaimer', 'notes', 'suggestion', 'template', 'reduceAction', 'redFlagAction', 'condition', 'note', 'stallRule', 'topOfRangeRule'])
const STRING_LISTS = new Set(['sources', 'options', 'equipment', 'covers', 'eatingOut', 'tasks', 'expected', 'excluded', 'rangeLimits', 'redFlags', 'types', 'allowed', 'avoid', 'environment', 'caveats', 'doNotTrack', 'spacingRules', 'shortWeekPriority', 'expectations'])
const NUMBER_LISTS = new Set(['lightWeeks', 'deloadWeeks', 'weeks', 'pctRange', 'durationHours', 'lastMealGapHours', 'preferredLossKgPerWeek'])

function humanize(name: string): string {
  const s = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function itemTitle(v: Json, i: number): string {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['name', 'label', 'metric', 'movement', 'type', 'slot', 'day', 'key']) if (typeof o[k] === 'string' && o[k]) return String(o[k])
    if (typeof o.week === 'number') return `Week ${o.week}`
  }
  return `Item ${i + 1}`
}

/** A blank copy of an item (strings emptied, numbers kept, lists emptied) when no template exists. */
function blankLike(v: Json): Json {
  if (Array.isArray(v)) return []
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, blankLike(x)]))
  if (typeof v === 'string') return ''
  return v
}

function setKey(obj: Record<string, unknown>, key: string, value: Json): Record<string, unknown> {
  const next = { ...obj }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}

function Field({ name, value, onChange, depth }: { name: string; value: Json; onChange: (v: Json) => void; depth: number }) {
  const label = humanize(name)
  const enumOptions = ENUM_HINTS[name]

  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} /> {label}
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <label className="block text-xs text-[var(--ink-3)]">
        {label}
        <input
          className={INPUT}
          inputMode="decimal"
          key={`${name}-${String(value)}`}
          defaultValue={String(value)}
          onBlur={e => {
            const t = e.target.value.trim().replace(',', '.')
            if (t === '') { onChange(undefined); return }
            const n = Number(t)
            onChange(Number.isFinite(n) ? n : t)
          }}
        />
      </label>
    )
  }

  if (typeof value === 'string' || (value === undefined && enumOptions)) {
    const v = typeof value === 'string' ? value : ''
    if (enumOptions) {
      return (
        <label className="block text-xs text-[var(--ink-3)]">
          {label}
          <select className={INPUT} value={v} onChange={e => onChange(e.target.value || undefined)}>
            {!enumOptions.includes(v) && <option value={v}>{v || '—'}</option>}
            {enumOptions.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      )
    }
    const long = LONG_TEXT.has(name) || v.length > 80
    return (
      <label className="block text-xs text-[var(--ink-3)]">
        {label}
        {long
          ? <textarea className={`${INPUT} min-h-[72px]`} value={v} onChange={e => onChange(e.target.value === '' ? undefined : e.target.value)} />
          : <input className={INPUT} value={v} onChange={e => onChange(e.target.value === '' ? undefined : e.target.value)} />}
      </label>
    )
  }

  if (Array.isArray(value)) {
    if (NUMBER_LISTS.has(name) || (value.length > 0 && value.every(x => typeof x === 'number'))) {
      return (
        <label className="block text-xs text-[var(--ink-3)]">
          {label} <span className="font-normal">(comma separated)</span>
          <input
            className={INPUT}
            key={`${name}-${value.join(',')}`}
            defaultValue={value.join(', ')}
            onBlur={e => onChange(e.target.value.split(',').map(x => x.trim()).filter(Boolean).map(x => (Number.isFinite(Number(x)) ? Number(x) : x)))}
          />
        </label>
      )
    }
    if (STRING_LISTS.has(name) || (value.length > 0 && value.every(x => typeof x === 'string'))) {
      return (
        <label className="block text-xs text-[var(--ink-3)]">
          {label} <span className="font-normal">(one per line)</span>
          <textarea
            className={`${INPUT} min-h-[72px]`}
            key={`${name}-${value.length}-${String(value[0] ?? '')}`}
            defaultValue={(value as string[]).join('\n')}
            onBlur={e => onChange(e.target.value.split('\n').map(x => x.trim()).filter(Boolean))}
          />
        </label>
      )
    }
    return <ItemList name={name} items={value} onChange={onChange} depth={depth} />
  }

  if (value && typeof value === 'object') {
    return (
      <fieldset className={`rounded-lg border border-[var(--rule)] p-3 ${depth > 1 ? 'bg-[var(--paper-2,#f8f9fb)]' : ''}`}>
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">{label}</legend>
        <ObjectFields value={value as Record<string, unknown>} onChange={onChange} depth={depth + 1} />
      </fieldset>
    )
  }

  return null
}

function ObjectFields({ value, onChange, depth }: { value: Record<string, unknown>; onChange: (v: Json) => void; depth: number }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {Object.entries(value).map(([k, v]) => {
        const wide = (v && typeof v === 'object') || LONG_TEXT.has(k) || STRING_LISTS.has(k)
        return (
          <div key={k} className={wide ? 'sm:col-span-2' : ''}>
            <Field name={k} value={v} depth={depth} onChange={nv => onChange(setKey(value, k, nv))} />
          </div>
        )
      })}
    </div>
  )
}

function ItemList({ name, items, onChange, depth }: { name: string; items: Json[]; onChange: (v: Json) => void; depth: number }) {
  const template = ITEM_TEMPLATES[name] ?? (items[0] !== undefined ? blankLike(items[0]) : {})
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">{humanize(name)} ({items.length})</p>
      {items.map((item, i) => (
        <details key={i} className="rounded-lg border border-[var(--rule)] bg-white p-2" open={items.length <= 2}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[var(--ink)]">
            <span>{itemTitle(item, i)}</span>
            <span className="flex gap-1 text-xs font-normal">
              <button type="button" className="rounded border border-[var(--rule)] px-2 py-0.5" aria-label="Move up" onClick={e => { e.preventDefault(); move(i, -1) }}>↑</button>
              <button type="button" className="rounded border border-[var(--rule)] px-2 py-0.5" aria-label="Move down" onClick={e => { e.preventDefault(); move(i, 1) }}>↓</button>
              <button type="button" className="rounded border border-red-200 px-2 py-0.5 text-red-700" onClick={e => { e.preventDefault(); onChange(items.filter((_, j) => j !== i)) }}>Remove</button>
            </span>
          </summary>
          <div className="mt-2">
            {item && typeof item === 'object' && !Array.isArray(item)
              ? <ObjectFields value={item as Record<string, unknown>} depth={depth + 1} onChange={nv => onChange(items.map((x, j) => (j === i ? nv : x)))} />
              : <Field name={name} value={item} depth={depth + 1} onChange={nv => onChange(items.map((x, j) => (j === i ? nv : x)))} />}
          </div>
        </details>
      ))}
      <button type="button" className={`${BUTTON_SECONDARY} self-start`} onClick={() => onChange([...items, structuredClone(template)])}>+ Add</button>
    </div>
  )
}

/** Editor for one section's value ({ field: value, … } for the fields the section covers). */
export default function SectionValueEditor({ section, value, onChange }: { section: SectionKey; value: SectionValue; onChange: (v: SectionValue) => void }) {
  const [json, setJson] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const fields = sectionMeta(section).fields as readonly string[]

  if (json !== null) {
    return (
      <div className="flex flex-col gap-2">
        <textarea className={`${INPUT} min-h-[280px] font-mono text-xs`} value={json} onChange={e => setJson(e.target.value)} spellCheck={false} />
        {jsonError && <p className="text-sm text-red-700">{jsonError}</p>}
        <div className="flex gap-2">
          <button type="button" className={BUTTON_SECONDARY} onClick={() => {
            try {
              const parsed = JSON.parse(json) as unknown
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected an object')
              const extra = Object.keys(parsed).filter(k => !fields.includes(k))
              if (extra.length) throw new Error(`Unknown field(s): ${extra.join(', ')}`)
              onChange(parsed as SectionValue)
              setJson(null)
              setJsonError(null)
            } catch (err) {
              setJsonError(err instanceof Error ? err.message : 'Invalid JSON')
            }
          }}>Apply JSON</button>
          <button type="button" className="text-sm underline" onClick={() => { setJson(null); setJsonError(null) }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map(f => {
        const v = value[f]
        if (v === undefined) {
          const tpl = OBJECT_TEMPLATES[f] ?? (ITEM_TEMPLATES[f] !== undefined ? [] : undefined)
          return (
            <div key={f} className="flex items-center justify-between rounded-lg border border-dashed border-[var(--rule)] p-3 text-sm text-[var(--ink-3)]">
              <span>{humanize(f)}: not set</span>
              {tpl !== undefined && <button type="button" className={BUTTON_SECONDARY} onClick={() => onChange({ ...value, [f]: structuredClone(tpl) })}>+ Add {humanize(f).toLowerCase()}</button>}
            </div>
          )
        }
        return (
          <div key={f} className="flex flex-col gap-1">
            <Field name={f} value={v} depth={1} onChange={nv => onChange(setKey(value, f, nv) as SectionValue)} />
            {f !== 'identity' && (
              <button type="button" className="self-end text-xs text-[var(--ink-3)] underline" onClick={() => onChange(setKey(value, f, undefined) as SectionValue)}>
                Clear {humanize(f).toLowerCase()}
              </button>
            )}
          </div>
        )
      })}
      <button type="button" className="self-start text-xs font-semibold text-[var(--blue-700)] underline" onClick={() => setJson(JSON.stringify(value, null, 2))}>
        Edit as JSON (all fields)
      </button>
    </div>
  )
}
