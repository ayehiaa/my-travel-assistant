import { describe, expect, it } from 'vitest'
import {
  IMPORT_SECTIONS, SECTION_KEYS, assembleDraft, buildImportPrompt, joinSections, normaliseValue, parseImportResponse,
  programmeDiff, replaceSection, importPath, isOwnImportPath, isStaleImport, ImportRequestSchema, sectionOf, sectionStatus, splitIntoSections, toKey, validateSection, ITEM_TEMPLATES,
} from './programmeImport'
import { ProgrammeDefinitionSchema } from './programmeSchema'
import { SEED_PROGRAMME } from './seedProgramme'

describe('sections', () => {
  it('cover every top-level definition field exactly once', () => {
    const fields = IMPORT_SECTIONS.flatMap(s => [...s.fields])
    const shapeKeys = Object.keys(ProgrammeDefinitionSchema.shape).filter(k => k !== 'schemaVersion')
    expect(new Set(fields).size).toBe(fields.length)
    expect([...fields].sort()).toEqual([...shapeKeys].sort())
  })

  it('split + join round-trips the seed programme', () => {
    const raw = JSON.parse(JSON.stringify(SEED_PROGRAMME)) as Record<string, unknown>
    const joined = joinSections(splitIntoSections(raw))
    expect(ProgrammeDefinitionSchema.parse(joined)).toEqual(SEED_PROGRAMME)
  })
})

describe('toKey / normaliseValue', () => {
  it('makes valid keys', () => {
    expect(toKey('Session A')).toBe('session_a')
    expect(toKey('  Plant stanols (2 g) ')).toBe('plant_stanols_2_g')
    expect(toKey('1st block')).toBe('k_1st_block')
    expect(toKey('Café')).toBe('cafe')
    expect(toKey('!!!')).toBe('item')
  })
  it('drops nulls and empty strings, coerces key fields', () => {
    expect(normaliseValue({ a: null, b: '', c: ' x ', key: 'My Key', covers: ['Beta Glucan'], session: 'A' }))
      .toEqual({ c: 'x', key: 'my_key', covers: ['beta_glucan'], session: 'a' })
  })
})

describe('section status', () => {
  it('extracted / needs review / not found', () => {
    expect(sectionStatus('components', { components: SEED_PROGRAMME.components }, false)).toBe('extracted')
    expect(sectionStatus('components', { components: SEED_PROGRAMME.components }, true)).toBe('needs_review')
    expect(sectionStatus('components', { components: [{ key: 'x', name: 'X' }] }, false)).toBe('needs_review')
    expect(sectionStatus('sleep', {}, false)).toBe('not_found')
    expect(sectionStatus('components', { components: [] }, false)).toBe('not_found')
    // Identity is required: missing → needs review, never "not found".
    expect(sectionStatus('identity', {}, false)).toBe('needs_review')
  })
  it('validateSection rejects unknown fields and reports paths', () => {
    expect(validateSection('sleep', { sleep: { caffeineCutoff: '25:00' } }).ok).toBe(false)
    expect(validateSection('sleep', { other: 1 }).ok).toBe(false)
    const r = validateSection('identity', { identity: { name: 'X', durationWeeks: 8 } })
    expect(r.ok && (r.value.identity as { version: string }).version).toBe('1')
  })
})

describe('parseImportResponse', () => {
  it('reads programme + uncertain notes and computes statuses', () => {
    const text = 'Here:\n' + JSON.stringify({
      programme: {
        identity: { name: 'Plan', durationWeeks: 8 },
        components: [{ key: 'Oats', name: 'Oats', unit: 'g', target: 3, period: 'day', timing: 'any', sources: [] }],
        trainingSessions: [{ key: 'A', name: 'A', focus: 'Upper', exercises: [{ key: 'Press', name: 'Press', sets: 3, reps: '10' }] }],
        weeklySchedule: { days: [{ day: 'mon', kind: 'session', session: 'A', label: 'A' }] },
        sleep: null,
      },
      uncertain: { blocks: 'table unclear', bogus: 'x', sessions: 'check reps' },
    })
    const d = parseImportResponse(text)!
    expect(d.statuses.identity).toBe('extracted')
    expect(d.statuses.components).toBe('extracted')
    expect(d.statuses.sessions).toBe('needs_review')
    expect(d.statuses.schedule).toBe('extracted')
    expect(d.statuses.sleep).toBe('not_found')
    expect(d.statuses.blocks).toBe('not_found')
    expect(d.notes).toEqual({ blocks: 'table unclear', sessions: 'check reps' })
    expect((d.sections.components.components as Array<{ key: string }>)[0].key).toBe('oats')
  })
  it('returns null for non-JSON or a missing programme', () => {
    expect(parseImportResponse('sorry')).toBeNull()
    expect(parseImportResponse('{"uncertain":{}}')).toBeNull()
  })
})

describe('assembleDraft', () => {
  const sections = splitIntoSections(JSON.parse(JSON.stringify(SEED_PROGRAMME)))
  it('needs every section confirmed', () => {
    const r = assembleDraft(sections, ['identity'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.unconfirmed).toHaveLength(SECTION_KEYS.length - 1)
  })
  it('passes when all confirmed and valid', () => {
    const r = assembleDraft(sections, SECTION_KEYS)
    expect(r.ok).toBe(true)
  })
  it('maps cross-field errors to sections', () => {
    const bad = { ...sections, sessions: { trainingSessions: [] } }
    const r = assembleDraft(bad, SECTION_KEYS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some(e => e.section === 'schedule')).toBe(true)
  })
})

describe('replaceSection + programmeDiff', () => {
  it('edits one section and summarises the change', () => {
    const comps = sectionOf(SEED_PROGRAMME, 'components').components as Array<Record<string, unknown>>
    const next = [...comps.slice(1), { ...(ITEM_TEMPLATES.components as object), key: 'psyllium', name: 'Psyllium' }]
    next[0] = { ...next[0], target: 99 }
    const r = replaceSection(SEED_PROGRAMME, 'components', { components: next })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const diff = programmeDiff(SEED_PROGRAMME, r.definition)
    expect(diff).toHaveLength(1)
    expect(diff[0].section).toBe('components')
    expect(diff[0].summary).toContain('added Psyllium')
    expect(diff[0].summary).toContain(`removed ${comps[0].name}`)
    expect(diff[0].summary).toContain(`changed ${comps[1].name}`)
  })
  it('reports changed object leaves', () => {
    const r = replaceSection(SEED_PROGRAMME, 'sleep', { sleep: { ...SEED_PROGRAMME.sleep, caffeineCutoff: '13:00' } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(programmeDiff(SEED_PROGRAMME, r.definition)[0].summary).toBe('Sleep: changed sleep.caffeineCutoff')
  })
  it('rejects an invalid section', () => {
    expect(replaceSection(SEED_PROGRAMME, 'identity', { identity: { name: '' } }).ok).toBe(false)
  })
  it('no diff for identical definitions', () => {
    expect(programmeDiff(SEED_PROGRAMME, SEED_PROGRAMME)).toEqual([])
  })
})

describe('prompt', () => {
  it('wraps pasted text as data and lists sections', () => {
    const p = buildImportPrompt({ hasPdf: false, text: 'Eat oats' })
    expect(p).toContain('<document>\nEat oats\n</document>')
    expect(p).toContain('milestones (milestones, outcomes)')
    expect(buildImportPrompt({ hasPdf: true, text: null })).not.toContain('<document>')
  })
})

describe('import uploads', () => {
  const U = '11111111-1111-1111-1111-111111111111'
  const F = '22222222-2222-2222-2222-222222222222'
  it('paths are per user', () => {
    expect(importPath(U, F)).toBe(`imports/${U}/${F}.pdf`)
    expect(isOwnImportPath(importPath(U, F), U)).toBe(true)
    expect(isOwnImportPath(importPath(F, U), U)).toBe(false)
    expect(isOwnImportPath(`imports/${U}/../x.pdf`, U)).toBe(false)
  })
  it('stale after an hour', () => {
    const now = new Date('2026-11-22T12:00:00Z')
    expect(isStaleImport('2026-11-22T10:30:00Z', now)).toBe(true)
    expect(isStaleImport('2026-11-22T11:30:00Z', now)).toBe(false)
    expect(isStaleImport(null, now)).toBe(false)
  })
  it('request schema: text or storage path', () => {
    expect(ImportRequestSchema.safeParse({ text: 'x'.repeat(60) }).success).toBe(true)
    expect(ImportRequestSchema.safeParse({ text: 'short' }).success).toBe(false)
    expect(ImportRequestSchema.safeParse({ storagePath: 'imports/a/b.pdf', fileName: 'p.pdf' }).success).toBe(true)
    expect(ImportRequestSchema.safeParse({ text: 'x'.repeat(60), storagePath: 'a' }).success).toBe(false)
  })
})
