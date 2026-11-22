import { ProgrammeDefinitionSchema, type ProgrammeDefinition, type ProgrammeDefinitionInput } from './programmeSchema'

/**
 * The seed template: "12-Week Programme v3" (specs/029-health-routines §3.1, "Seed example" column).
 * Shipped as a code constant (no migration data). Users enrol from it and personalise targets from their profile.
 *
 * Sessions A/B/C, blocks, weekly schedule and the 7-day meal rotation are taken from the owner's programme document
 * (the PDF itself is not in the repo). Exercise video links are YouTube searches by exercise name.
 */

export const SEED_TEMPLATE_KEY = 'seed-12wk-v3'

const BANDS = ['Resistance band']
const DB = ['Dumbbells']
const BENCH = ['Bench']

/**
 * Block 2 knee progression (owner's document): only once the pain rule has passed (same condition as the
 * sit-to-stand unlock) — shallow wall-sit holds may build to 60 s; band terminal knee extension → a stronger band.
 * Block 1, or the pain rule not passed: the 45 s knee-watched hold cap applies.
 */
const WALL_SIT_B2 = { fromBlock: 'b2', requires: 'pain_rule_ok' as const, holdCapSeconds: 60, note: 'Pain rule passed — build the hold up to 60 s (same shallow ~45° angle).' }
const TKE_B2 = { fromBlock: 'b2', requires: 'pain_rule_ok' as const, note: 'Use a stronger band.' }

/** YouTube search link for a demonstration (the PDF's own links are not in the repo; a search never goes dead). */
function yt(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' exercise form')}`
}

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
    days: [
      { day: 'mon', slots: [
        { slot: 'breakfast', options: ['Oats + soya + walnuts + blueberries'], flex: false },
        { slot: 'lunch', options: ['Jacket potato + tuna + big salad'], flex: false },
        { slot: 'afternoon', options: ['Skyr + pomegranate'], flex: false },
        { slot: 'dinner', options: ['Grilled salmon + vegetables + Benecol'], flex: false },
      ] },
      { day: 'tue', slots: [
        { slot: 'breakfast', options: ['Oats + soya + almonds + banana'], flex: false },
        { slot: 'lunch', options: ['Shish tawook (no butter) + bulgur + salad'], flex: false },
        { slot: 'afternoon', options: ['Hummus + carrots'], flex: false },
        { slot: 'dinner', options: ['Cod or hake + roasted vegetables + Benecol'], flex: false },
      ] },
      { day: 'wed', slots: [
        { slot: 'breakfast', options: ['Oats + soya + mixed nuts + berries'], flex: false },
        { slot: 'lunch', options: ['Lentil soup + tabbouleh + 1 flatbread'], flex: false },
        { slot: 'afternoon', options: ['Skyr + berries'], flex: false },
        { slot: 'dinner', options: ['Tandoori chicken + dhal + chapati + Benecol'], flex: false },
      ] },
      { day: 'thu', slots: [
        { slot: 'breakfast', options: ['2 poached eggs + smoked salmon + 1 slice toast + avocado'], flex: false },
        { slot: 'lunch', options: ['Ful medames + salad + olive oil'], flex: false },
        { slot: 'afternoon', options: ['Leblebi (40 g) + apple'], flex: false },
        { slot: 'dinner', options: ['Tofu stir-fry + vegetables + rice + Benecol'], flex: false },
      ] },
      { day: 'fri', slots: [
        { slot: 'breakfast', options: ['Oats + soya + nuts + pomegranate'], flex: false },
        { slot: 'lunch', options: ['Sardines or mackerel on wholegrain toast + salad'], flex: false },
        { slot: 'afternoon', options: ['Skyr + nuts'], flex: false },
        { slot: 'dinner', options: ['Grilled sea bass + potato + vegetables + Benecol'], flex: false },
      ] },
      { day: 'sat', slots: [
        { slot: 'breakfast', options: ['Oats + soya + nuts', 'Eggs + avocado + 1 toast'], flex: false },
        { slot: 'lunch', options: ['Eat out — grilled protein, salad, one starch'], flex: true },
        { slot: 'afternoon', options: ['Hummus + crudités'], flex: false },
        { slot: 'dinner', options: ['Lighter: skyr + fruit, or a small plate'], flex: false },
      ] },
      { day: 'sun', slots: [
        { slot: 'breakfast', options: ['Oats + soya + nuts + berries'], flex: false },
        { slot: 'lunch', options: ['Jacket potato + tuna', 'Leftover grilled fish'], flex: false },
        { slot: 'afternoon', options: ['Skyr + pomegranate'], flex: false },
        { slot: 'dinner', options: ['Chicken + bulgur + hummus + salad + Benecol'], flex: false },
      ] },
    ],
  },
  nutritionRules: [
    { type: 'one_starch_per_meal', maxStarchServings: 1 },
    { type: 'protein_every_occasion', minProteinG: 10 },
    { type: 'treat_budget', minKcal: 200 },
    { type: 'caffeine_cutoff', time: '14:00' },
    { type: 'last_meal_before_bed', minGapHours: 2 },
  ],
  eatingOut: [
    'Grilled, not fried — mashwi, tandoori, à la plancha, alla griglia',
    'Sauce on the side, always — butter sauces are 12–20 g saturated fat each',
    'Ask for no butter on the grill (worth 1.5–2 g saturated fat every time)',
    'Hidden saturated fat: bacon in roast potatoes, ghee, coconut milk curries, mayonnaise "garlic sauce", palm-oil coatings',
    'Leave a third of the portion',
  ],
  trainingSessions: [
    {
      key: 'a', name: 'Session A', focus: 'Upper body', painCheck: false,
      exercises: [
        { key: 'db_bench_press', name: 'Dumbbell bench press', sets: 4, reps: '8-12', restSeconds: 90, region: 'upper', equipment: [...DB, ...BENCH],
          notes: 'Flat bench. Elbows ~45° from torso, not flared.', videoUrl: yt('Dumbbell bench press') },
        { key: 'one_arm_row', name: 'One-arm dumbbell row', sets: 4, reps: '10-12', restSeconds: 75, region: 'upper', perSide: true, equipment: [...DB, ...BENCH],
          notes: 'One hand on the bench, both feet on the floor: no kneeling. Pull to the hip.', videoUrl: yt('One-arm dumbbell row'),
          travelSubstitute: { name: 'Backpack row' } },
        { key: 'seated_shoulder_press', name: 'Seated dumbbell shoulder press', sets: 3, reps: '8-12', restSeconds: 90, region: 'upper', equipment: [...DB, ...BENCH],
          notes: "Bench upright. Don't lock out hard at the top.", videoUrl: yt('Seated dumbbell shoulder press'),
          travelSubstitute: { name: 'Pike push-up' } },
        { key: 'band_lat_pulldown', name: 'Band lat pulldown (anchored high)', sets: 3, reps: '12-15', restSeconds: 60, region: 'upper', equipment: BANDS,
          notes: 'Pull to collarbone, squeeze shoulder blades down.', videoUrl: yt('Band lat pulldown') },
        { key: 'incline_db_press', name: 'Incline dumbbell press', sets: 3, reps: '10-12', restSeconds: 75, region: 'upper', equipment: [...DB, ...BENCH],
          notes: 'Bench at 30–40°. Upper chest.', videoUrl: yt('Incline dumbbell press'),
          travelSubstitute: { name: 'Push-up (feet elevated)' } },
        { key: 'lateral_raise', name: 'Dumbbell lateral raise', sets: 3, reps: '12-15', restSeconds: 60, region: 'upper', equipment: DB,
          notes: 'Light. Lead with elbows, stop at shoulder height.', videoUrl: yt('Dumbbell lateral raise') },
        { key: 'band_face_pull', name: 'Band face pull', sets: 3, reps: '15-20', restSeconds: 45, region: 'upper', equipment: BANDS,
          notes: "Posture insurance. Don't skip it at a desk job.", videoUrl: yt('Band face pull') },
      ],
    },
    {
      key: 'b', name: 'Session B', focus: 'Lower body (knee-friendly) & core', painCheck: true,
      exercises: [
        { key: 'db_hip_thrust', name: 'Dumbbell hip thrust', sets: 4, reps: '10-15', restSeconds: 90, region: 'lower', equipment: [...DB, ...BENCH], jointWatch: true,
          notes: 'Shoulders on the bench, weight across the hips. The knee stays at a right angle and barely moves.', videoUrl: yt('Dumbbell hip thrust'),
          travelSubstitute: { name: 'Single-leg glute bridge' } },
        { key: 'romanian_deadlift', name: 'Romanian deadlift', sets: 4, reps: '8-12', restSeconds: 90, region: 'lower', equipment: DB, jointWatch: true,
          notes: 'Hinge at the hip, soft knees, flat back. Feel it in the hamstrings.', videoUrl: yt('Dumbbell Romanian deadlift'),
          travelSubstitute: { name: 'Single-leg Romanian deadlift' } },
        { key: 'shallow_wall_sit', name: 'Shallow wall sit (hold)', sets: 4, holdSeconds: 45, restSeconds: 60, region: 'lower', jointWatch: true,
          notes: 'Hold 30–45 s. Slide down only a third of the way: knees bent about 45°, never to a right angle.', videoUrl: yt('Wall sit'),
          blockProgressions: [WALL_SIT_B2] },
        { key: 'band_tke', name: 'Band terminal knee extension', sets: 3, reps: '15-20', restSeconds: 45, region: 'lower', perSide: true, equipment: BANDS, jointWatch: true,
          notes: 'Band behind the knee, anchored in front. Straighten fully and squeeze the thigh for 2 seconds.', videoUrl: yt('Band terminal knee extension'),
          blockProgressions: [TKE_B2] },
        { key: 'band_hamstring_curl', name: 'Band seated hamstring curl', sets: 3, reps: '12-15', restSeconds: 60, region: 'lower', equipment: BANDS, jointWatch: true,
          notes: 'Bend to a right angle and no further. Stop if you feel it at the back of the knee.', videoUrl: yt('Band seated hamstring curl') },
        { key: 'band_side_step', name: 'Band side-step', sets: 3, reps: '12 each way', restSeconds: 45, region: 'lower', equipment: BANDS,
          notes: 'Band just above the knees, knees only slightly bent. Strong hips take load off the kneecap.', videoUrl: yt('Band side step') },
        { key: 'standing_calf_raise', name: 'Standing calf raise (dumbbells)', sets: 3, reps: '15-20', restSeconds: 45, region: 'lower', equipment: DB,
          notes: 'Full stretch at the bottom, pause at the top.', videoUrl: yt('Standing dumbbell calf raise') },
        { key: 'dead_bug', name: 'Dead bug', sets: 3, reps: '10 each', restSeconds: 45, region: 'core',
          notes: 'Lower back stays flat on the floor throughout.', videoUrl: yt('Dead bug exercise') },
        { key: 'plank', name: 'Plank', sets: 3, holdSeconds: 60, restSeconds: 45, region: 'core',
          notes: "Hold 45–60 s. Squeeze glutes, don't let hips sag.", videoUrl: yt('Plank') },
      ],
    },
    {
      key: 'c', name: 'Session C', focus: 'Full body', painCheck: true,
      exercises: [
        { key: 'floor_press_or_push_up', name: 'Dumbbell floor press or push-up', sets: 3, reps: '10-15', restSeconds: 75, region: 'upper', equipment: DB,
          notes: 'Elevate feet on the bench to make push-ups harder.', videoUrl: yt('Dumbbell floor press'),
          travelSubstitute: { name: 'Push-up (feet elevated)' } },
        { key: 'staggered_rdl', name: 'Staggered-stance Romanian deadlift', sets: 3, reps: '10-12', restSeconds: 75, region: 'lower', perSide: true, equipment: DB, jointWatch: true,
          notes: 'Back foot on its toes for balance, front leg does the work. Knee soft, not bending further as you lower.', videoUrl: yt('Staggered stance Romanian deadlift'),
          travelSubstitute: { name: 'Single-leg Romanian deadlift' } },
        { key: 'chest_supported_row', name: 'Chest-supported row (bench at 30°)', sets: 4, reps: '10-12', restSeconds: 75, region: 'upper', equipment: [...DB, ...BENCH],
          notes: 'Chest on the incline bench. Removes lower-back fatigue.', videoUrl: yt('Chest supported dumbbell row'),
          travelSubstitute: { name: 'Backpack row' } },
        { key: 'single_leg_glute_bridge', name: 'Single-leg glute bridge', sets: 3, reps: '10-12', restSeconds: 60, region: 'lower', perSide: true, jointWatch: true,
          notes: 'Lying on your back, one foot on the floor. Keep the hips level and pause at the top.', videoUrl: yt('Single leg glute bridge') },
        { key: 'c_shallow_wall_sit', name: 'Shallow wall sit (hold)', sets: 3, holdSeconds: 45, restSeconds: 60, region: 'lower', jointWatch: true,
          notes: 'Hold 30–45 s. Same shallow ~45° angle as Session B.', videoUrl: yt('Wall sit'),
          blockProgressions: [WALL_SIT_B2] },
        { key: 'arnold_press', name: 'Arnold press', sets: 3, reps: '10-12', restSeconds: 75, region: 'upper', equipment: DB,
          notes: 'Rotate palms as you press. Hits all three delt heads.', videoUrl: yt('Arnold press'),
          travelSubstitute: { name: 'Pike push-up' } },
        { key: 'db_curl', name: 'Dumbbell curl', sets: 3, reps: '10-12', restSeconds: 45, region: 'upper', equipment: DB, supersetGroup: 'c1',
          notes: 'Superset with the overhead triceps extension, no rest between the pair.', videoUrl: yt('Dumbbell curl') },
        { key: 'oh_triceps_ext', name: 'Overhead triceps extension', sets: 3, reps: '10-12', restSeconds: 45, region: 'upper', equipment: DB, supersetGroup: 'c1',
          notes: 'Superset with the curl.', videoUrl: yt('Dumbbell overhead triceps extension') },
        { key: 'band_pull_apart', name: 'Band pull-apart', sets: 3, reps: '15-20', restSeconds: 45, region: 'upper', equipment: BANDS,
          notes: 'Rear delts and upper back.', videoUrl: yt('Band pull apart') },
      ],
    },
  ],
  weeklySchedule: {
    days: [
      { day: 'mon', kind: 'session', session: 'a', label: 'Session A — Upper (black coffee 45 min before if training before 2pm)' },
      { day: 'tue', kind: 'cardio', label: 'Zone 2 cardio — 30 min brisk walk or bike (saddle high)' },
      { day: 'wed', kind: 'session', session: 'b', label: 'Session B — Lower & core (hardest session — eat properly beforehand)' },
      { day: 'thu', kind: 'cardio', label: 'Zone 2 cardio — 30 min' },
      { day: 'fri', kind: 'session', session: 'c', label: 'Session C — Full body' },
      { day: 'sat', kind: 'cardio', label: 'Zone 2 cardio — 30 min, outdoors if possible' },
      { day: 'sun', kind: 'walk', label: '30 min easy walk — recovery; plan the week\'s food' },
    ],
    spacingRules: ['At least one day between lifting sessions', 'Keep A → B → C order every week', 'Evening training: skip the pre-training coffee'],
    shortWeekPriority: ['c', 'a', 'b'],
  },
  blocks: [
    { key: 'b1', name: 'Block 1 — Foundation', weeks: [1, 4], focus: 'Technique and base', sets: 3, repRange: '10-15', rir: '2-3', lightWeeks: [4],
      notes: '3 sets of every exercise; load light enough that form is perfect. Record every weight — this is your baseline. Week 4 is lighter: same sessions, 2 sets each.' },
    { key: 'b2', name: 'Block 2 — Build', weeks: [5, 8], focus: 'Load and volume', sets: 4, repRange: '8-12', rir: '1-2',
      intensityTechnique: '4 sets on the first two exercises of each session (set counts as in the session tables); last set of each exercise to failure', lightWeeks: [8],
      notes: 'Week 8 lighter: 2 sets at 60% of normal load.' },
    { key: 'b3', name: 'Block 3 — Intensify', weeks: [9, 12], focus: 'Maximum stimulus', sets: 4, repRange: '6-12 compounds / 12-20 isolation', rir: '1-2',
      intensityTechnique: 'Drop set on the final set of one exercise per session: to failure, drop 30% of the weight, go again', deloadWeeks: [12],
      notes: '4 sets throughout. Week 12 is a deload — half the volume, then retest.' },
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
    { week: 1, tasks: ['Physiotherapy review', 'Lipid panel', 'Weight', 'Waist', 'Progress photos', 'Baseline lifts', 'Start creatine'], expected: ['Your reference point for everything'] },
    { week: 4, tasks: ['Weight and waist', 'Lighter training week'], expected: ['Weight −1 to −1.5 kg (less on the scale with creatine)', 'Lifts +10–20%'] },
    { week: 6, tasks: ['Mid-point review', 'Adjust calories if needed'], expected: ['Weight −2 to −2.5 kg', 'Waist −2 to −3 cm'] },
    { week: 8, tasks: ['Weight and waist', 'Lighter training week'], expected: ['Weight −3 to −3.5 kg'] },
    { week: 12, tasks: ['Full lipid panel', 'Weight', 'Waist', 'Progress photos', 'Retest lifts'], expected: ['Weight −4 to −5 kg', 'Waist −5 to −7 cm'] },
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

/**
 * Enrolments copy the template into health_programmes, so copies made before a template fix miss it. For the seed
 * template only, fill `blockProgressions` on exercises that have none (matched by session + exercise key). Pure —
 * applied on read; never removes or changes anything the user's copy already has.
 */
export function upgradeSeedDefinition(def: ProgrammeDefinition, templateKey: string | null): ProgrammeDefinition {
  if (templateKey !== SEED_TEMPLATE_KEY) return def
  let changed = false
  const trainingSessions = def.trainingSessions.map(s => {
    const seed = SEED_PROGRAMME.trainingSessions.find(t => t.key === s.key)
    if (!seed) return s
    return {
      ...s,
      exercises: s.exercises.map(ex => {
        const src = seed.exercises.find(e => e.key === ex.key)
        if (!src || src.blockProgressions.length === 0 || (ex.blockProgressions ?? []).length > 0) return ex
        changed = true
        return { ...ex, blockProgressions: src.blockProgressions.map(p => ({ ...p })) }
      }),
    }
  })
  return changed ? { ...def, trainingSessions } : def
}
