import { describe, it, expect } from 'vitest'
import { dayPace, evaluateRules, rankRecommendations, RULE_COVERAGE, type RuleContext, type RuleEntry, type RuleFinding } from './rules'
import { SEED_PROGRAMME } from './seedProgramme'
import { computeTargets } from './targets'
import type { FoodItem } from './nutrition'

const targets = computeTargets(SEED_PROGRAMME, { sex: 'male', age: 40, heightCm: 180, weightKg: 80.5, activityLevel: 'moderate', timezone: 'Europe/London' }).targets

const food = (over: Partial<FoodItem> = {}): RuleEntry['items'][number] => ({
  name: 'Food', kcal: 300, proteinG: 25, carbsG: 30, fatG: 8, satFatG: 2, fibreG: 5, components: {}, isTreat: false, ...over,
})

const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  def: SEED_PROGRAMME, targets, now: '10:00', date: '2026-11-18', entries: [], weekComponents: {}, bedtime: null, ...over,
})

const keys = (f: RuleFinding[]) => f.map(x => x.key)

// A day that meets every daily component, protein and fibre (to isolate one rule at a time).
const fullComponents = { plant_stanols: 2, beta_glucan: 3, soy_protein: 25, nuts: 30, pulses: 1 }
const goodDay: RuleEntry[] = [
  { time: '07:30', slot: 'breakfast', items: [food({ proteinG: 50, fibreG: 15, components: { beta_glucan: 3, soy_protein: 25, nuts: 30 } })] },
  { time: '13:30', slot: 'lunch', items: [food({ proteinG: 50, fibreG: 15, components: { pulses: 1, starch_servings: 1 } })] },
  { time: '19:30', slot: 'dinner', items: [food({ proteinG: 50, fibreG: 10, components: { plant_stanols: 2, starch_servings: 1 } })] },
]

describe('rules engine', () => {
  it('nothing fires on an empty morning', () => {
    expect(evaluateRules(ctx())).toEqual([])
  })

  it('a compliant full day fires nothing', () => {
    expect(evaluateRules(ctx({ now: '21:00', entries: goodDay, weekComponents: { ...fullComponents, oily_fish: 2 } }))).toEqual([])
  })

  it('sat fat: at risk, over target, over ceiling', () => {
    const at = (sat: number, now = '15:00') =>
      keys(evaluateRules(ctx({ now, entries: [{ time: '13:00', slot: 'lunch', items: [food({ satFatG: sat, proteinG: 80 })] }] })))
    expect(at(12)).toContain('satfat.at_risk')
    expect(evaluateRules(ctx({ now: '15:00', entries: [{ time: '13:00', slot: 'lunch', items: [food({ satFatG: 12, proteinG: 80 })] }] }))
      .find(f => f.key === 'satfat.at_risk')?.message).toMatch(/12\/15 g — keep dinner to fish\/chicken\/tofu/)
    expect(at(16)).toContain('satfat.over_target')
    expect(at(19)).toContain('satfat.over_ceiling')
    expect(at(10)).not.toContain('satfat.at_risk')
  })

  it('energy at risk / over', () => {
    const e = (kcal: number) => keys(evaluateRules(ctx({ now: '14:30', entries: [{ time: '13:00', slot: 'lunch', items: [food({ kcal, proteinG: 80 })] }] })))
    expect(e(1900)).toContain('kcal.at_risk')
    expect(e(2300)).toContain('kcal.over')
    expect(e(1000)).not.toContain('kcal.at_risk')
  })

  it('protein behind pace in the afternoon', () => {
    const f = evaluateRules(ctx({ now: '16:00', entries: [{ time: '13:00', slot: 'lunch', items: [food({ proteinG: 30 })] }] }))
    const p = f.find(x => x.key === 'protein.behind')
    expect(p?.message).toMatch(/Protein 30\/145 g — behind pace.*250 g skyr.*Dinner: 150 g chicken or tofu/)
    expect(keys(evaluateRules(ctx({ now: '11:00', entries: [] })))).not.toContain('protein.behind')
  })

  it('daily components nudge after their time', () => {
    const f = evaluateRules(ctx({ now: '16:30', entries: [] }))
    expect(f.find(x => x.key === 'component.pulses')?.message).toBe('No pulses yet today — Add hummus with carrots or 40 g leblebi.')
    expect(keys(f)).not.toContain('component.plant_stanols') // nudge after 17:00
    expect(keys(evaluateRules(ctx({ now: '15:59' })))).not.toContain('component.pulses')
  })

  it('weekly components when the days left are running out', () => {
    // Thursday, 0 of 2 oily fish → 4 days left ≤ 2 × 2
    const thu = evaluateRules(ctx({ date: '2026-11-19', weekComponents: {} }))
    expect(thu.find(x => x.key === 'component_week.oily_fish')?.message).toMatch(/Oily fish 0 of 2 this week — Plan salmon/)
    expect(keys(evaluateRules(ctx({ date: '2026-11-17' })))).not.toContain('component_week.oily_fish')
    expect(keys(evaluateRules(ctx({ date: '2026-11-21', weekComponents: { oily_fish: 2 } })))).not.toContain('component_week.oily_fish')
  })

  it('stanols outside a meal', () => {
    const f = evaluateRules(ctx({ now: '11:00', entries: [{ time: '10:30', slot: 'coffee', items: [food({ components: { plant_stanols: 2 } })] }] }))
    expect(f.find(x => x.key === 'timing.with_meal.plant_stanols')?.message).toBe('Plant stanols work best with a meal — have the next one with lunch.')
  })

  it('caffeine after the cut-off', () => {
    const f = evaluateRules(ctx({ now: '15:40', entries: [{ time: '15:30', slot: 'afternoon', items: [food({ kcal: 60, proteinG: 6, components: { caffeine_mg: 120 } })] }] }))
    expect(f.find(x => x.key === 'timing.caffeine')?.message).toBe('Caffeine at 15:30 is after your 14:00 cut-off — choose decaf; sleep matters more than the lift.')
    const decaf = evaluateRules(ctx({ now: '15:40', entries: [{ time: '15:30', slot: 'afternoon', items: [food({ components: { caffeine_mg: 3 } })] }] }))
    expect(keys(decaf)).not.toContain('timing.caffeine')
  })

  it('last meal within 2 h of bed (incl. after midnight)', () => {
    const late = (time: string, bedtime: string) =>
      keys(evaluateRules(ctx({ now: '23:59', bedtime, entries: [{ time, slot: 'dinner', items: [food({ proteinG: 200 })] }] })))
    expect(late('22:30', '23:00')).toContain('timing.last_meal')
    expect(late('20:30', '23:00')).not.toContain('timing.last_meal')
    expect(late('23:30', '00:30')).toContain('timing.last_meal')
    expect(keys(evaluateRules(ctx({ now: '23:59', bedtime: null, entries: [{ time: '22:30', slot: 'dinner', items: [food()] }] })))).not.toContain('timing.last_meal')
  })

  it('one starch per meal', () => {
    const f = evaluateRules(ctx({ now: '13:40', entries: [{ time: '13:20', slot: 'lunch', items: [food({ components: { starch_servings: 1 } }), food({ components: { starch_servings: 1 } })] }] }))
    expect(f.find(x => x.key === 'structure.one_starch')?.message)
      .toBe('One-starch rule: lunch had 2 starch servings — next time choose rice or bread. Today: skip starch at dinner to stay on target.')
  })

  it('protein in every eating occasion', () => {
    const f = evaluateRules(ctx({ now: '11:00', entries: [{ time: '10:30', slot: 'coffee', items: [food({ kcal: 250, proteinG: 4 })] }] }))
    expect(f.find(x => x.key === 'structure.protein_occasion')?.message).toMatch(/^Coffee had 4 g protein/)
    const small = evaluateRules(ctx({ now: '11:00', entries: [{ time: '10:30', slot: 'coffee', items: [food({ kcal: 60, proteinG: 2 })] }] }))
    expect(keys(small)).not.toContain('structure.protein_occasion')
  })

  it('treat budget trade-off', () => {
    const f = evaluateRules(ctx({ now: '11:00', entries: [{ time: '10:30', slot: 'coffee', items: [food({ name: 'Cinnamon roll', kcal: 400, proteinG: 12, satFatG: 11, isTreat: true })] }] }))
    expect(f.find(x => x.key === 'budget.treat')?.message)
      .toBe('Treat (400 kcal) fits your sat-fat spare (4 g left). Pay the calories: drop the starch at lunch and dinner.')
  })

  it('ranks safety > ceilings > daily > weekly > habits, max 3', () => {
    const mk = (key: string, group: RuleFinding['group'], priority: number): RuleFinding => ({ key, group, priority, type: 'target', message: key })
    const ranked = rankRecommendations([mk('h', 'habit', 99), mk('w', 'weekly', 1), mk('d', 'daily', 10), mk('c', 'ceiling', 1), mk('s', 'safety', 0)])
    expect(ranked.map(r => r.key)).toEqual(['s', 'c', 'd'])
    expect(rankRecommendations([mk('a', 'daily', 1), mk('b', 'daily', 5)]).map(r => r.key)).toEqual(['b', 'a'])
  })

  it('pace and coverage', () => {
    expect(dayPace(SEED_PROGRAMME, '07:00')).toBe(0)
    expect(dayPace(SEED_PROGRAMME, '20:00')).toBe(1)
    expect(RULE_COVERAGE.filter(r => r.phase === 'P1a').length).toBeGreaterThanOrEqual(7)
  })
})

describe('training rules (P1b)', () => {
  const training = (over: Partial<NonNullable<RuleContext['training']>> = {}): RuleContext['training'] => ({
    sessionToday: true, trainedToday: false, jointWatchedToday: true, joint: { level: 'ok', message: null }, ...over,
  })
  it('pre-training coffee before the cut-off, skip it in the evening', () => {
    const am = evaluateRules(ctx({ now: '09:00', training: training() })).find(f => f.key === 'timing.pre_training_coffee')
    expect(am?.message).toMatch(/45 min before/)
    const pm = evaluateRules(ctx({ now: '17:00', training: training() })).find(f => f.key === 'timing.pre_training_coffee')
    expect(pm?.message).toMatch(/skip the pre-training coffee/i)
    expect(keys(evaluateRules(ctx({ now: '09:00', training: training({ sessionToday: false }) })))).not.toContain('timing.pre_training_coffee')
    expect(keys(evaluateRules(ctx({ now: '09:00', training: training({ trainedToday: true }) })))).not.toContain('timing.pre_training_coffee')
    expect(keys(evaluateRules(ctx({ now: '09:00' })))).not.toContain('timing.pre_training_coffee')
  })
  it('joint red flag is a safety recommendation ranked first', () => {
    const f = evaluateRules(ctx({ now: '18:00', training: training({ joint: { level: 'stop', message: 'See your physio' } }) }))
    expect(rankRecommendations(f)[0].key).toBe('safety.joint_red_flag')
  })
  it('reduce shows only on a day with joint-watched work still to do', () => {
    const reduce = { level: 'reduce' as const, message: 'Shorten the range' }
    expect(keys(evaluateRules(ctx({ training: training({ joint: reduce }) })))).toContain('safety.joint_reduce')
    expect(keys(evaluateRules(ctx({ training: training({ joint: reduce, jointWatchedToday: false }) })))).not.toContain('safety.joint_reduce')
    expect(keys(evaluateRules(ctx({ training: training({ joint: reduce, sessionToday: false }) })))).not.toContain('safety.joint_reduce')
  })
})
