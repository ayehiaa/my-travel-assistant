import { readAssumptions, type Assumption } from './assumptions'
import type { FoodItem, ItemSource } from './nutrition'

/**
 * P3.1 storage without a migration: assumptions, the reference row id and the real item source ('reference' is not
 * allowed by the P1a `source` CHECK) live under a reserved `_meta` key inside the existing `components` jsonb column.
 * Pure. Rows saved before P3.1 have no `_meta` → no assumptions, source from the column.
 */

export const META_KEY = '_meta'

export interface ItemMeta {
  assumptions: Assumption[]
  refId: string | null
  source: ItemSource | null
}

const META_SOURCES: ReadonlySet<string> = new Set(['reference'])

/** Split a stored components value into the numeric component map and the P3.1 meta. */
export function splitItemMeta(raw: unknown): { components: Record<string, unknown>; meta: ItemMeta } {
  const meta: ItemMeta = { assumptions: [], refId: null, source: null }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { components: {}, meta }
  const { [META_KEY]: m, ...components } = raw as Record<string, unknown>
  if (m && typeof m === 'object' && !Array.isArray(m)) {
    const mm = m as Record<string, unknown>
    meta.assumptions = readAssumptions(mm.assumptions)
    meta.refId = typeof mm.refId === 'string' && /^[a-z0-9-]{2,20}:[A-Za-z0-9-]{1,20}$/.test(mm.refId) ? mm.refId : null
    meta.source = typeof mm.source === 'string' && META_SOURCES.has(mm.source) ? (mm.source as ItemSource) : null
  }
  return { components, meta }
}

/** Components + `_meta` for writing (no `_meta` at all when there is nothing to keep — old shape). */
export function joinItemMeta(item: Pick<FoodItem, 'components' | 'assumptions' | 'refId' | 'source'>): Record<string, unknown> {
  const meta: Record<string, unknown> = {}
  if (item.assumptions?.length) meta.assumptions = item.assumptions
  if (item.refId) meta.refId = item.refId
  if (item.source === 'reference') meta.source = 'reference'
  return Object.keys(meta).length ? { ...item.components, [META_KEY]: meta } : { ...item.components }
}

/** Short dataset label for the reference source chip (kept here so client code need not load the dataset). */
export const REFERENCE_SOURCE_LABEL = 'USDA SR28'

/** Where an item's numbers came from, as shown on the item ("Ref: USDA SR28", "Library", …). */
export function itemSourceLabel(source: ItemSource): string {
  switch (source) {
    case 'reference': return `Ref: ${REFERENCE_SOURCE_LABEL}`
    case 'library': return 'Library'
    case 'off': return 'Open Food Facts'
    case 'manual': return 'Entered by hand'
    default: return 'AI estimate'
  }
}
