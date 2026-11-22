import type { FoodItem } from '@/lib/health/nutrition'
import { sendJson, errorOf } from './api'

/** One-tap log of known items (recent meal, favourite, component suggestion) through the normal food API. */
export async function relogItems(input: { date: string; time: string; slot: string | null; items: FoodItem[] }): Promise<string | null> {
  const r = await sendJson('/api/health/food', { ...input, text: null, restaurant: false, noAddedFat: false, photoPaths: [], remember: [] })
  return r.ok ? null : errorOf(r, 'Could not log it')
}

/** Current local time HH:MM in this browser. */
export function browserTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
