import { ProgrammeDefinitionSchema, type ProgrammeDefinition, type ProgrammeDefinitionInput } from './programmeSchema'

/**
 * The seed template: "12-Week Programme v3" (specs/029-health-routines §3.1, "Seed example" column).
 * Shipped as a code constant (no migration data). Users enrol from it and personalise targets from their profile.
 *
 * The source PDF is not in the repo — values come from the spec summary. Exercise lists for sessions A/B/C are
 * reconstructed from the session descriptions (7 / 9 / 8 exercises, knee-friendly, no excluded movements) and should
 * be checked against the original document (see plan.md "Decisions made autonomously").
 */

export const SEED_TEMPLATE_KEY = 'seed-12wk-v3'

const BANDS = ['Resistance band']
const DB = ['Dumbbells']

const SEED_INPUT: ProgrammeDefinitionInput = {
  schemaVersion: 1,
  identity: {
    name: '12-Week Programme v3',
    version: '3',
    durationWeeks: 12,
    author: 'Template',
    description:
      'Twelve weeks of steady fat loss with LDL-lowering food components, three home strength sessions a week, ' +
      'Zone 2 cardio, sleep and simple tracking.',
    disclaimer:
      'Not medical advice. Follow the plan you and your clinicians agreed; stop and seek professional advice if a ' +
      'red-flag rule fires.',
  },
  energy: { mode: 'tdee_deficit', referenceKcal: 2200, deficitKcal: 500, minKcal: 1200 },
  macros: {
    protein: { gPerKg: 1.8, g: 145 },
    fat:     { g: 75, pctOfKcal: 0.3, pctRange: [0.25, 0.35] },
    satFat:  { targetG: 15, ceilingG: 18 },
    carbs:   { mode: 'remainder', g: 235 },
    fibre:   { minG: 35 },
  },
  components: [
    {
      key: 'plant_stanols', name: 'Plant stanols', unit: 'g', target: 2, period: 'day', timing: 'with_meal',
      sources: ['Stanol mini-drink', 'Stanol yoghurt', 'Stanol spread'], nudgeAfter: '17:00',
      suggestion: 'Have your stanol drink or yoghurt with dinner — stanols work with a meal.',
    },
    {
      key: 'beta_glucan', name: 'Beta-glucan', unit: 'g', target: 3, period: 'day',
      sources: ['Porridge oats', 'Oat bran', 'Barley'], nudgeAfter: '16:00',
      suggestion: 'Add oats or oat bran — e.g. 40 g oat bran in yoghurt this afternoon.',
    },
    {
      key: 'soy_protein', name: 'Soy protein', unit: 'g', target: 25, period: 'day',
      sources: ['Soya milk', 'Tofu', 'Edamame', 'Soya yoghurt'], nudgeAfter: '16:00',
      suggestion: 'Soya milk in your coffee, edamame as a snack or tofu at dinner.',
    },
    {
      key: 'nuts', name: 'Nuts', unit: 'g', target: 30, period: 'day',
      sources: ['Almonds', 'Walnuts', 'Pistachios'], nudgeAfter: '16:00',
      suggestion: 'A 30 g handful of almonds or walnuts this afternoon.',
    },
    {
      key: 'pulses', name: 'Pulses', unit: 'servings', target: 1, period: 'day',
      sources: ['Hummus', 'Leblebi (roasted chickpeas)', 'Lentils', 'Beans'], nudgeAfter: '16:00',
      suggestion: 'Add hummus with carrots or 40 g leblebi.',
    },
    {
      key: 'oily_fish', name: 'Oily fish', unit: 'servings', target: 2, period: 'week',
      sources: ['Salmon', 'Mackerel', 'Sardines', 'Trout'],
      suggestion: 'Plan salmon, mackerel or sardines for one meal before Sunday.',
    },
  ],
  mealSlots: [
    { key: 'breakfast', name: 'Breakfast', start: '07:00', end: '08:00', isMeal: true,
      template: 'Oats with soya milk, berries and nuts', covers: ['beta_glucan', 'soy_protein', 'nuts'] },
    { key: 'coffee', name: 'Coffee', start: '10:00', end: '11:30', isMeal: false,
      template: 'Soya flat white', covers: ['soy_protein'] },
    { key: 'lunch', name: 'Lunch', start: '13:00', end: '14:00', isMeal: true,
      template: 'Lean protein, salad, one starch', covers: ['pulses'] },
    { key: 'afternoon', name: 'Afternoon', start: '16:00', end: '17:00', isMeal: false,
      template: 'Skyr or hummus with vegetables', covers: ['pulses', 'nuts'] },
    { key: 'dinner', name: 'Dinner', start: '19:00', end: '20:00', isMeal: true,
      template: 'Fish / chicken / tofu with vegetables, one starch, stanol drink', covers: ['plant_stanols', 'oily_fish'] },
  ],
  mealRotation: {
    days: (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(day => ({
      day,
      slots: [
        { slot: 'breakfast', options: ['Porridge with soya milk', 'Soya yoghurt, oat bran and berries'], flex: false },
        { slot: 'lunch', options: day === 'sat' ? ['Eat out (flex)'] : ['Chicken and lentil salad', 'Tuna and bean wrap'], flex: day === 'sat' },
        { slot: 'dinner', options: day === 'tue' || day === 'fri' ? ['Salmon, rice and greens'] : ['Chicken or tofu stir-fry', 'Turkey chilli with beans'], flex: false },
      ],
    })),
  },
  nutritionRules: [
    { type: 'one_starch_per_meal', maxStarchServings: 1 },
    { type: 'protein_every_occasion', minProteinG: 10 },
    { type: 'treat_budget', minKcal: 200 },
    { type: 'caffeine_cutoff', time: '14:00' },
    { type: 'last_meal_before_bed', minGapHours: 2 },
  ],
  eatingOut: [
    'Grilled, not fried',
    'Sauce on the side',
    'Ask for no butter on the grill',
    'Watch the hidden saturated fat: cream sauces, cheese, pastry, butter-finished vegetables',
    'Leave a third of the portion',
  ],
  trainingSessions: [
    {
      key: 'a', name: 'Session A', focus: 'Upper body', painCheck: false,
      exercises: [
        { key: 'db_floor_press', name: 'Dumbbell floor press', sets: 3, reps: '10-15', restSeconds: 90, region: 'upper', equipment: DB },
        { key: 'one_arm_row', name: 'One-arm dumbbell row', sets: 3, reps: '10-15', restSeconds: 90, region: 'upper', perSide: true, equipment: DB },
        { key: 'seated_db_press', name: 'Seated dumbbell shoulder press', sets: 3, reps: '10-15', restSeconds: 90, region: 'upper', equipment: DB },
        { key: 'incline_push_up', name: 'Incline push-up', sets: 3, reps: '10-15', restSeconds: 60, region: 'upper',
          travelSubstitute: { name: 'Push-up against the hotel desk' } },
        { key: 'band_pull_apart', name: 'Band pull-apart', sets: 3, reps: '15-20', restSeconds: 45, region: 'upper', equipment: BANDS, supersetGroup: '1' },
        { key: 'db_curl', name: 'Dumbbell curl', sets: 3, reps: '10-15', restSeconds: 60, region: 'upper', equipment: DB, supersetGroup: '2' },
        { key: 'oh_triceps', name: 'Overhead triceps extension', sets: 3, reps: '10-15', restSeconds: 60, region: 'upper', equipment: DB, supersetGroup: '2' },
      ],
    },
    {
      key: 'b', name: 'Session B', focus: 'Lower body (knee-friendly) & core', painCheck: true,
      exercises: [
        { key: 'glute_bridge', name: 'Glute bridge', sets: 3, reps: '12-15', restSeconds: 60, region: 'lower', jointWatch: true },
        { key: 'db_rdl', name: 'Dumbbell Romanian deadlift', sets: 3, reps: '10-15', restSeconds: 90, region: 'lower', equipment: DB, tempo: '3-1-1', jointWatch: true },
        { key: 'wall_sit', name: 'Wall sit (≤45° knee bend)', sets: 3, holdSeconds: 30, restSeconds: 60, region: 'lower', jointWatch: true,
          notes: 'Shallow angle only — never deeper than 45°.' },
        { key: 'banded_lateral_walk', name: 'Banded lateral walk', sets: 3, reps: '12-15', restSeconds: 45, region: 'lower', perSide: true, equipment: BANDS },
        { key: 'standing_calf_raise', name: 'Standing calf raise', sets: 3, reps: '12-20', restSeconds: 45, region: 'lower' },
        { key: 'straight_leg_raise', name: 'Straight-leg raise', sets: 3, reps: '10-15', restSeconds: 45, region: 'lower', perSide: true, jointWatch: true },
        { key: 'dead_bug', name: 'Dead bug', sets: 3, reps: '8-12', restSeconds: 45, region: 'core', perSide: true },
        { key: 'side_plank', name: 'Side plank', sets: 3, holdSeconds: 30, restSeconds: 45, region: 'core', perSide: true },
        { key: 'pallof_press', name: 'Pallof press', sets: 3, reps: '10-12', restSeconds: 45, region: 'core', perSide: true, equipment: BANDS },
      ],
    },
    {
      key: 'c', name: 'Session C', focus: 'Full body', painCheck: true,
      exercises: [
        { key: 'c_db_rdl', name: 'Dumbbell Romanian deadlift', sets: 3, reps: '10-15', restSeconds: 90, region: 'lower', equipment: DB, jointWatch: true },
        { key: 'c_db_bench', name: 'Dumbbell bench or floor press', sets: 3, reps: '10-15', restSeconds: 90, region: 'upper', equipment: DB },
        { key: 'hip_thrust', name: 'Hip thrust', sets: 3, reps: '10-15', restSeconds: 90, region: 'lower', jointWatch: true },
        { key: 'c_row', name: 'Chest-supported dumbbell row', sets: 3, reps: '10-15', restSeconds: 90, region: 'upper', equipment: DB },
        { key: 'lateral_raise', name: 'Dumbbell lateral raise', sets: 3, reps: '12-20', restSeconds: 60, region: 'upper', equipment: DB },
        { key: 'farmer_carry', name: 'Farmer carry', sets: 3, holdSeconds: 40, restSeconds: 60, region: 'full', equipment: DB },
        { key: 'c_calf_raise', name: 'Standing calf raise', sets: 3, reps: '12-20', restSeconds: 45, region: 'lower' },
        { key: 'plank', name: 'Front plank', sets: 3, holdSeconds: 30, restSeconds: 45, region: 'core' },
      ],
    },
  ],
  weeklySchedule: {
    days: [
      { day: 'mon', kind: 'session', session: 'a', label: 'Session A — Upper' },
      { day: 'tue', kind: 'cardio', label: 'Zone 2 cardio' },
      { day: 'wed', kind: 'session', session: 'b', label: 'Session B — Lower & core' },
      { day: 'thu', kind: 'cardio', label: 'Zone 2 cardio' },
      { day: 'fri', kind: 'session', session: 'c', label: 'Session C — Full body' },
      { day: 'sat', kind: 'cardio', label: 'Zone 2 cardio' },
      { day: 'sun', kind: 'walk', label: 'Easy walk' },
    ],
    spacingRules: ['At least one day between lifting sessions', 'Order A → B → C'],
    shortWeekPriority: ['c', 'a', 'b'],
  },
  blocks: [
    { key: 'b1', name: 'Block 1', weeks: [1, 4], focus: 'Technique and base', sets: 3, repRange: '10-15', rir: '2-3', lightWeeks: [4] },
    { key: 'b2', name: 'Block 2', weeks: [5, 8], focus: 'Build', sets: 3, repRange: '8-12',
      intensityTechnique: '4 sets on the first two exercises; last set to failure', lightWeeks: [8] },
    { key: 'b3', name: 'Block 3', weeks: [9, 12], focus: 'Peak', sets: 3, repRange: '6-12 / 12-20',
      intensityTechnique: 'Drop set on the last set', deloadWeeks: [12], notes: 'Week 12: deload and retest.' },
  ],
  progression: {
    loadIncrementKg: { upper: 2, lower: 4 },
    topOfRangeRule: 'Top of the rep range on every set → add load next time (+2 kg upper / +4 kg lower).',
    stallRule: 'Stalled for two sessions → add a set instead of load.',
  },
  movementRestrictions: {
    excluded: ['Squats', 'Lunges', 'Split squats', 'Step-downs', 'Deep knee bends', 'Kneeling'],
    rangeLimits: ['Wall sit no deeper than 45° knee bend'],
    conditionalUnlocks: [
      { movement: 'Sit-to-stand', fromBlock: 'b2', requires: 'pain_rule_ok' },
      { movement: 'Step-ups', fromBlock: 'b3', requires: 'professional_approval', notes: 'Only with physiotherapist agreement.' },
    ],
  },
  painRules: {
    scaleMax: 10,
    okThreshold: 3,
    nextDayCheck: true,
    reduceAction: 'Pain above 3 or next-day soreness: shorten the range or reduce the load on affected exercises.',
    redFlags: ['Locking', 'Giving way', 'New swelling'],
    redFlagAction: 'Stop leg work and see your physiotherapist before the next session.',
  },
  cardio: {
    types: ['Zone 2'],
    sessionsPerWeek: 4,
    minutes: 30,
    intensity: { zone: 'Zone 2', bpmMin: 104, bpmMax: 122 },
    allowed: ['Flat or uphill walk', 'Incline treadmill', 'Bike (saddle high)', 'Front crawl'],
    avoid: ['Running', 'Long downhill or stair descents', 'Rowing machine', 'Breaststroke'],
    unlockables: [{ name: 'Intervals 6 × 1 min / 2 min', fromWeek: 5, condition: 'Only if recovering well and joints are quiet.' }],
  },
  dailyMovement: { stepsMin: 8000, stepsMax: 10000 },
  sleep: {
    durationHours: [7, 8],
    consistencyMinutes: 30,
    caffeineCutoff: '14:00',
    lastMealGapHours: [2, 3],
    environment: ['Bedroom 18–19 °C', 'No phone in bed'],
  },
  supplements: [
    {
      key: 'creatine', name: 'Creatine monohydrate', dose: '3–5 g', timing: 'Daily, any time',
      notes: 'Tell your GP you take creatine before blood tests.',
      waterWeightWeeks: 3,
      caveats: ['Water weight +0.5–1.5 kg in weeks 1–3'],
    },
  ],
  tracking: {
    metrics: [
      { metric: 'Weight', frequency: 'Daily → 7-day average' },
      { metric: 'Waist', frequency: 'Fortnightly' },
      { metric: 'Training log', frequency: 'Every session' },
      { metric: 'Joint response', frequency: 'After sessions B and C' },
      { metric: 'Saturated fat and protein', frequency: 'Daily' },
      { metric: 'Lipid panel', frequency: 'Week 1 and week 12' },
    ],
    doNotTrack: ['Morning temperature', 'Daily weight in isolation'],
  },
  adjustment: {
    everyWeeks: 2,
    minWeighInsPerWeek: 5,
    preferredLossKgPerWeek: [0.3, 0.4],
    bands: [
      { lossMaxKg: 0.4, kcalChange: -150, label: 'Loss under 0.4 kg over the fortnight → −150 kcal' },
      { lossMinKg: 0.4, lossMaxKg: 1.2, kcalChange: 0, label: 'Loss 0.4–1.2 kg (aim 0.6–0.9) → no change' },
      { lossMinKg: 1.2, kcalChange: 150, label: 'Loss over 1.2 kg → +150 kcal' },
    ],
  },
  milestones: [
    { week: 1, tasks: ['Physio review', 'Lipid panel', 'Weight', 'Waist', 'Progress photos', 'Baseline lifts', 'Start creatine'], expected: [] },
    { week: 4, tasks: ['Review lifts'], expected: ['Weight −1 to −1.5 kg', 'Lifts +10–20%'] },
    { week: 6, tasks: ['Mid-programme review'], expected: ['Weight −2 to −2.5 kg', 'Waist −2 to −3 cm'] },
    { week: 8, tasks: ['Review'], expected: ['Weight −3 to −3.5 kg'] },
    { week: 12, tasks: ['Lipid panel', 'Retest lifts'], expected: ['Weight −4 to −5 kg', 'Waist −5 to −7 cm'] },
  ],
  outcomes: {
    expectations: ['LDL −1.0 to −1.5 mmol/L (20–30%) with all components for 12 weeks.'],
    escalation: [{ metric: 'LDL', threshold: 4.9, unit: 'mmol/L', note: 'If LDL is above 4.9 mmol/L after 12 weeks of adherence, discuss next steps with your GP.' }],
  },
}

/** The seed template, parsed (defaults applied). Throws at import time if the constant is invalid (caught by tests). */
export const SEED_PROGRAMME: ProgrammeDefinition = ProgrammeDefinitionSchema.parse(SEED_INPUT)

export interface ProgrammeTemplate {
  key: string
  definition: ProgrammeDefinition
}

export const PROGRAMME_TEMPLATES: readonly ProgrammeTemplate[] = [{ key: SEED_TEMPLATE_KEY, definition: SEED_PROGRAMME }]

export function findTemplate(key: string): ProgrammeTemplate | null {
  return PROGRAMME_TEMPLATES.find(t => t.key === key) ?? null
}
