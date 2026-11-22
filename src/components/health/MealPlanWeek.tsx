'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useToast } from '@/context/ToastContext'
import { healthHref } from '@/lib/health/healthHub'
import {
  buildShoppingList, choiceKey, formatQuantity, planWeek, shoppingListText,
  type Ingredient, type MealPlanChoices, type RotationDef,
} from '@/lib/health/mealPlan'
import { WEEKDAYS } from '@/lib/health/programmeSchema'
import { sendJson, errorOf } from './api'
import { BUTTON_SECONDARY, CARD, CARD_TITLE, INPUT } from './ui'

const DAY_NAMES: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

interface Props {
  def: RotationDef
  week: string
  prevWeek: string
  nextWeek: string
  today: string
  initialChoices: MealPlanChoices
  initialChecked: string[]
  aiCache: Record<string, Ingredient[]>
}

/** Meal plan (specs/029 US13): the week's rotation with swaps within a slot, and a generated shopping list. */
export default function MealPlanWeek({ def, week, prevWeek, nextWeek, today, initialChoices, initialChecked, aiCache }: Props) {
  const toast = useToast()
  const router = useRouter()
  const [choices, setChoices] = useState<MealPlanChoices>(initialChoices)
  const [checked, setChecked] = useState<string[]>(initialChecked)
  const [splitting, setSplitting] = useState(false)

  const cells = useMemo(() => planWeek(def, week, choices), [def, week, choices])
  const list = useMemo(() => buildShoppingList(cells, aiCache), [cells, aiCache])
  const itemCount = list.groups.reduce((n, g) => n + g.items.length, 0)
  const doneCount = list.groups.reduce((n, g) => n + g.items.filter(i => checked.includes(i.key)).length, 0)

  async function swap(day: string, slot: string, option: string, rotationFirst: string | null) {
    const key = `${day}:${slot}`
    const next = { ...choices }
    if (option === rotationFirst) delete next[key]
    else next[key] = option
    const before = choices
    setChoices(next)
    const res = await sendJson('/api/health/meal-plan', { week, choices: next }, 'PATCH')
    if (!res.ok) { setChoices(before); toast(errorOf(res, 'Could not save the swap'), 'error') }
  }

  async function toggle(key: string) {
    const next = checked.includes(key) ? checked.filter(k => k !== key) : [...checked, key]
    const before = checked
    setChecked(next)
    const res = await sendJson('/api/health/meal-plan', { week, checked: next }, 'PATCH')
    if (!res.ok) { setChecked(before); toast(errorOf(res, 'Could not save'), 'error') }
  }

  async function copy() {
    const text = shoppingListText(list, week, checked)
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ title: 'Shopping list', text })
        return
      }
      await navigator.clipboard.writeText(text)
      toast('Shopping list copied', 'success')
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return
      toast('Could not copy — select the list and copy it by hand', 'error')
    }
  }

  async function aiSplit() {
    setSplitting(true)
    const res = await sendJson<{ resolved: number }>('/api/health/meal-plan/ingredients', { week })
    setSplitting(false)
    if (!res.ok) { toast(errorOf(res, 'AI split failed'), 'error'); return }
    toast(`Split ${res.data.resolved} meal part${res.data.resolved === 1 ? '' : 's'} into ingredients`, 'success')
    router.refresh()
  }

  const rotationFirst = (day: string, slot: string) => def.mealRotation?.days.find(d => d.day === day)?.slots.find(s => s.slot === slot)?.options[0] ?? null

  if (!def.mealRotation || def.mealRotation.days.length === 0) {
    return <div className={CARD}><p className="text-sm text-[var(--ink-2)]">Your programme has no meal rotation. Add one under Edit & versions → Meal slots & rotation.</p></div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-2`}>
        <Link className={BUTTON_SECONDARY} href={healthHref({ tab: 'programme', view: 'meals', week: prevWeek })}>← Previous</Link>
        <p className="text-sm font-semibold text-[var(--ink)]">Week of {new Date(`${week}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}</p>
        <Link className={BUTTON_SECONDARY} href={healthHref({ tab: 'programme', view: 'meals', week: nextWeek })}>Next →</Link>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {WEEKDAYS.map(day => {
          const dayCells = cells.filter(c => c.day === day)
          if (dayCells.length === 0) return null
          const isToday = dayCells[0].date === today
          return (
            <div key={day} className={`${CARD} ${isToday ? 'ring-2 ring-[var(--blue-700)]' : ''}`}>
              <h3 className="mb-2 text-sm font-bold text-[var(--ink)]">{DAY_NAMES[day]}{isToday && <span className="ml-2 text-xs font-semibold text-[var(--blue-700)]">Today</span>}</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {dayCells.map(c => (
                  <li key={choiceKey(c.day, c.slot)}>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">
                      {c.slotName}{c.flex && <span className="ml-1 rounded bg-blue-50 px-1 font-semibold normal-case text-blue-800">flex</span>}
                      {c.swapped && <span className="ml-1 rounded bg-amber-50 px-1 font-semibold normal-case text-amber-900">swapped</span>}
                    </p>
                    {c.options.length > 1 ? (
                      <select aria-label={`${DAY_NAMES[day]} ${c.slotName}`} className={`${INPUT} mt-0.5`} value={c.chosen ?? ''} onChange={e => swap(c.day, c.slot, e.target.value, rotationFirst(c.day, c.slot))}>
                        {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <p className="text-sm text-[var(--ink)]">{c.chosen ?? '—'}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      <section className={CARD}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className={`${CARD_TITLE} mb-0`}>Shopping list <span className="font-normal normal-case">· {doneCount}/{itemCount} ticked</span></h3>
          <button type="button" className={BUTTON_SECONDARY} onClick={copy}>Copy / share</button>
        </div>
        {list.unresolved.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>{list.unresolved.length} meal part{list.unresolved.length === 1 ? '' : 's'} not recognised (listed under Other).</span>
            <button type="button" className="font-bold underline" disabled={splitting} onClick={aiSplit}>{splitting ? 'Splitting…' : 'Split with AI'}</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {list.groups.map(g => (
            <div key={g.aisle}>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--ink-3)]">{g.aisle}</h4>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {g.items.map(i => {
                  const done = checked.includes(i.key)
                  const q = formatQuantity(i)
                  return (
                    <li key={i.key}>
                      <label className="flex cursor-pointer items-start gap-2 py-1 text-sm">
                        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={done} onChange={() => toggle(i.key)} />
                        <span className={done ? 'text-[var(--ink-3)] line-through' : 'text-[var(--ink)]'}>
                          {i.name}{q && <span className="text-[var(--ink-3)]"> — {q}</span>}
                          {i.count > 1 && <span className="text-xs text-[var(--ink-3)]"> ({i.count} meals)</span>}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        {list.flexMeals > 0 && <p className="mt-3 text-xs text-[var(--ink-3)]">{list.flexMeals} meal{list.flexMeals === 1 ? '' : 's'} out (flex) — nothing to buy.</p>}
        <p className="mt-2 text-xs text-[var(--ink-3)]">Quantities are per planned serving × meals, rounded — adjust to your pack sizes.</p>
      </section>
    </div>
  )
}
