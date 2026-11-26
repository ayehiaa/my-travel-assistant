import { z } from 'zod'
import { hasFeature, type Access } from '@/lib/access'

/**
 * My Assistant (specs/033) — which data areas a user may ask about. Pure.
 * Travel and expenses are for every account (assistants see the linked member's data); lifestyle needs the Health
 * add-on and trading the Portfolio add-on — both members only (hasFeature is false for assistants).
 */

export const ASSISTANT_AREAS = ['travel', 'expenses', 'lifestyle', 'trading'] as const
export type AssistantArea = (typeof ASSISTANT_AREAS)[number]
export const AssistantAreaSchema = z.enum(ASSISTANT_AREAS)

export const AREA_LABELS: Record<AssistantArea, string> = {
  travel: 'Travel',
  expenses: 'Expenses',
  lifestyle: 'Lifestyle',
  trading: 'Trading',
}

type AccessLike = Pick<Access, 'accountType' | 'effectivePlan' | 'effectiveFeatures'>

/** Areas the user may use right now, in ASSISTANT_AREAS order. */
export function enabledAreas(access: AccessLike): AssistantArea[] {
  return ASSISTANT_AREAS.filter(area => isAreaAllowed(access, area))
}

export function isAreaAllowed(access: AccessLike, area: AssistantArea): boolean {
  if (area === 'lifestyle') return hasFeature(access, 'health')
  if (area === 'trading') return hasFeature(access, 'portfolio')
  return true
}

/** Known areas only, de-duplicated, in canonical order (junk → []). Used to read the areas frozen on a conversation. */
export function normalizeAreas(value: unknown): AssistantArea[] {
  if (!Array.isArray(value)) return []
  return ASSISTANT_AREAS.filter(a => value.includes(a))
}

export const SUGGESTIONS: Record<AssistantArea, readonly string[]> = {
  travel: [
    'How many days have I been outside the UK in the last 12 months?',
    'When is my next trip?',
  ],
  expenses: [
    'What did I spend last month by category?',
    "Which expenses haven't been reclaimed?",
  ],
  lifestyle: [
    'Am I on track for protein today?',
    'How has my weight trended over 4 weeks?',
  ],
  trading: [
    'How is my portfolio doing vs my target?',
    'Why did the last recommendation sell anything?',
  ],
}

/** The area a page belongs to (for the slide-over's pre-selected suggestions), or null. */
export function areaForPath(pathname: string | null | undefined): AssistantArea | null {
  const p = pathname ?? ''
  if (p.startsWith('/expenses')) return 'expenses'
  if (p.startsWith('/health')) return 'lifestyle'
  if (p.startsWith('/portfolio')) return 'trading'
  if (p === '/' || p.startsWith('/timeline') || p.startsWith('/search') || p.startsWith('/audit')) return 'travel'
  return null
}

/** Suggestion groups to show: the preferred area first (when enabled), then the other enabled areas. */
export function suggestionGroups(areas: readonly AssistantArea[], preferred: AssistantArea | null = null): Array<{ area: AssistantArea; label: string; prompts: readonly string[] }> {
  const ordered = preferred && areas.includes(preferred) ? [preferred, ...areas.filter(a => a !== preferred)] : [...areas]
  return ordered.map(area => ({ area, label: AREA_LABELS[area], prompts: SUGGESTIONS[area] }))
}
