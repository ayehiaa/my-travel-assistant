import { z } from 'zod'

/**
 * Health programme definition (specs/029-health-routines §3.1). Pure — safe in client and server code.
 *
 * A programme is a reusable, versioned JSON document. Every field of §3.1 is represented; everything except
 * identity (name + duration) is optional so a hand-written or imported programme can be partial.
 * Times are local wall-clock "HH:MM" strings (24 h); the user's enrolment timezone gives them meaning.
 */

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
export const HhMmSchema = z.string().regex(HHMM_RE, 'Expected a time as HH:MM')

const Text = z.string().trim().min(1).max(2000)
const ShortText = z.string().trim().min(1).max(200)
const Key = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Keys are lower_snake_case')
const NonNeg = z.number().finite().min(0)

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export const WeekdaySchema = z.enum(WEEKDAYS)

// ── Identity ────────────────────────────────────────────────────────────────

export const IdentitySchema = z.object({
  name:          ShortText,
  version:       z.string().trim().min(1).max(40).default('1'),
  durationWeeks: z.number().int().min(1).max(104),
  author:        ShortText.optional(),
  description:   Text.optional(),
  disclaimer:    Text.optional(),
})

// ── Energy & macros ─────────────────────────────────────────────────────────

export const EnergySchema = z.object({
  /**
   * 'tdee_deficit' — kcal = Mifflin-St Jeor BMR × activity factor − deficitKcal (personalised from the profile);
   * 'fixed'        — kcal = referenceKcal for everyone.
   */
  mode:          z.enum(['fixed', 'tdee_deficit']).default('fixed'),
  referenceKcal: z.number().min(800).max(6000).optional(),
  deficitKcal:   z.number().min(0).max(1500).optional(),
  /** Floor so a personalised target never goes below a safe minimum. */
  minKcal:       z.number().min(800).max(3000).optional(),
})

export const MacrosSchema = z.object({
  protein: z.object({
    gPerKg: z.number().min(0.5).max(3.5).optional(),
    g:      z.number().min(10).max(400).optional(),
  }).optional(),
  fat: z.object({
    g:      z.number().min(10).max(300).optional(),
    /** Share of kcal from fat (0–1), used when g is personalised. */
    pctOfKcal: z.number().min(0.1).max(0.6).optional(),
    pctRange:  z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  }).optional(),
  satFat: z.object({
    targetG:  z.number().min(1).max(100).optional(),
    ceilingG: z.number().min(1).max(100).optional(),
  }).optional(),
  carbs: z.object({
    /** 'remainder' = (kcal − protein×4 − fat×9) / 4. */
    mode: z.enum(['remainder', 'fixed']).default('remainder'),
    g:    z.number().min(0).max(800).optional(),
  }).optional(),
  fibre: z.object({ minG: z.number().min(0).max(100) }).optional(),
})

// ── Components (custom daily / weekly targets) ──────────────────────────────

export const ComponentSchema = z.object({
  key:     Key,
  name:    ShortText,
  unit:    z.enum(['g', 'mg', 'servings']),
  target:  z.number().positive().max(10000),
  period:  z.enum(['day', 'week']),
  /** Timing rule for this component, e.g. plant stanols must be eaten with a meal. */
  timing:  z.enum(['with_meal', 'any']).default('any'),
  sources: z.array(ShortText).max(30).default([]),
  /** Local time after which a daily component that is still missing produces a nudge. */
  nudgeAfter: HhMmSchema.optional(),
  /** Fixed recommendation text used when the component is behind. */
  suggestion: Text.optional(),
})
export type ProgrammeComponent = z.infer<typeof ComponentSchema>

// ── Meal slots + rotation ───────────────────────────────────────────────────

export const MealSlotSchema = z.object({
  key:      Key,
  name:     ShortText,
  start:    HhMmSchema,
  end:      HhMmSchema,
  /** Meals count for "with a meal" timing and the one-starch rule; snacks/drinks don't. */
  isMeal:   z.boolean().default(true),
  template: Text.optional(),
  targets:  z.object({
    kcal:     NonNeg.optional(),
    proteinG: NonNeg.optional(),
    satFatG:  NonNeg.optional(),
  }).optional(),
  covers:   z.array(Key).max(20).default([]),
})
export type MealSlot = z.infer<typeof MealSlotSchema>

export const MealRotationSchema = z.object({
  days: z.array(z.object({
    day:   WeekdaySchema,
    slots: z.array(z.object({
      slot:    Key,
      options: z.array(ShortText).max(10).default([]),
      flex:    z.boolean().default(false),
    })).max(12),
  })).max(7),
})

// ── Nutrition rules (typed; evaluated by src/lib/health/rules.ts) ───────────

export const NutritionRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('one_starch_per_meal'), maxStarchServings: z.number().min(0.5).max(5).default(1) }),
  z.object({ type: z.literal('protein_every_occasion'), minProteinG: z.number().min(1).max(60).default(15) }),
  z.object({
    type:    z.literal('treat_budget'),
    /** An item flagged as a treat with at least this many kcal triggers the trade-off message. */
    minKcal: z.number().min(50).max(2000).default(200),
  }),
  z.object({ type: z.literal('caffeine_cutoff'), time: HhMmSchema }),
  z.object({ type: z.literal('last_meal_before_bed'), minGapHours: z.number().min(0.5).max(6) }),
])
export type NutritionRule = z.infer<typeof NutritionRuleSchema>

// ── Training (P1b builds the player; the definition is complete now) ────────

export const ExerciseSchema = z.object({
  key:          Key,
  name:         ShortText,
  sets:         z.number().int().min(1).max(10).optional(),
  reps:         z.string().trim().max(40).optional(),
  holdSeconds:  z.number().int().min(1).max(600).optional(),
  restSeconds:  z.number().int().min(0).max(600).optional(),
  tempo:        z.string().trim().max(20).optional(),
  notes:        Text.optional(),
  videoUrl:     z.string().url().max(500).optional(),
  equipment:    z.array(ShortText).max(10).default([]),
  perSide:      z.boolean().default(false),
  supersetGroup: z.string().trim().max(10).optional(),
  /** 'upper' | 'lower' drives the load-increment rule. */
  region:       z.enum(['upper', 'lower', 'core', 'full']).optional(),
  /** Joint the pain rule watches for this exercise. */
  jointWatch:   z.boolean().default(false),
  travelSubstitute: z.object({ name: ShortText, notes: Text.optional() }).optional(),
  /**
   * Conditional changes from a block onwards (P2, owner's document): e.g. the shallow wall-sit hold may build to 60 s
   * from Block 2 once the pain rule has passed; the band terminal knee extension moves to a stronger band.
   */
  blockProgressions: z.array(z.object({
    fromBlock:      Key,
    requires:       z.enum(['pain_rule_ok']).default('pain_rule_ok'),
    holdCapSeconds: z.number().int().min(1).max(600).optional(),
    note:           ShortText.optional(),
  })).max(5).default([]),
})

export const TrainingSessionSchema = z.object({
  key:       Key,
  name:      ShortText,
  focus:     ShortText,
  exercises: z.array(ExerciseSchema).min(1).max(30),
  /** Per-block set/rep overrides keyed by block key. */
  blockOverrides: z.record(Key, z.object({ sets: z.number().int().min(1).max(10).optional(), reps: z.string().max(40).optional() })).default({}),
  painCheck: z.boolean().default(false),
})

export const WeeklyScheduleSchema = z.object({
  days: z.array(z.object({
    day:     WeekdaySchema,
    kind:    z.enum(['session', 'cardio', 'rest', 'walk']),
    session: Key.optional(),
    label:   ShortText,
  })).max(7),
  spacingRules:  z.array(ShortText).max(10).default([]),
  shortWeekPriority: z.array(Key).max(10).default([]),
})

export const BlockSchema = z.object({
  key:        Key,
  name:       ShortText,
  weeks:      z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  focus:      ShortText,
  sets:       z.number().int().min(1).max(10),
  repRange:   z.string().trim().max(40),
  rir:        z.string().trim().max(20).optional(),
  intensityTechnique: z.string().trim().max(200).optional(),
  lightWeeks: z.array(z.number().int().min(1)).max(10).default([]),
  deloadWeeks: z.array(z.number().int().min(1)).max(10).default([]),
  notes:      Text.optional(),
})

export const ProgressionSchema = z.object({
  loadIncrementKg: z.object({ upper: NonNeg, lower: NonNeg }).optional(),
  stallRule:       Text.optional(),
  topOfRangeRule:  Text.optional(),
})

export const MovementRestrictionsSchema = z.object({
  excluded:     z.array(ShortText).max(50).default([]),
  rangeLimits:  z.array(ShortText).max(20).default([]),
  conditionalUnlocks: z.array(z.object({
    movement: ShortText,
    fromBlock: Key.optional(),
    requires: z.enum(['pain_rule_ok', 'professional_approval']),
    notes:    Text.optional(),
  })).max(20).default([]),
})

export const PainRulesSchema = z.object({
  scaleMax:      z.number().int().min(5).max(10).default(10),
  okThreshold:   z.number().min(0).max(10),
  nextDayCheck:  z.boolean().default(true),
  reduceAction:  Text,
  redFlags:      z.array(ShortText).max(20).default([]),
  redFlagAction: Text,
})

// ── Cardio, movement, sleep, supplements ────────────────────────────────────

export const CardioSchema = z.object({
  types:           z.array(ShortText).max(20).default([]),
  sessionsPerWeek: z.number().int().min(0).max(14).optional(),
  minutes:         z.number().int().min(0).max(300).optional(),
  intensity:       z.object({ zone: ShortText, bpmMin: z.number().int().min(40).max(220).optional(), bpmMax: z.number().int().min(40).max(220).optional() }).optional(),
  allowed:         z.array(ShortText).max(30).default([]),
  avoid:           z.array(ShortText).max(30).default([]),
  unlockables:     z.array(z.object({ name: ShortText, fromWeek: z.number().int().min(1).optional(), condition: Text.optional() })).max(10).default([]),
})

export const DailyMovementSchema = z.object({ stepsMin: z.number().int().min(0).max(50000), stepsMax: z.number().int().min(0).max(50000).optional() })

export const SleepSchema = z.object({
  durationHours:     z.tuple([z.number().min(3).max(12), z.number().min(3).max(12)]).optional(),
  consistencyMinutes: z.number().int().min(5).max(180).optional(),
  /** Optional planned bedtime; otherwise the median of recent check-ins is used. */
  targetBedtime:     HhMmSchema.optional(),
  caffeineCutoff:    HhMmSchema.optional(),
  lastMealGapHours:  z.tuple([z.number().min(0).max(6), z.number().min(0).max(6)]).optional(),
  environment:       z.array(ShortText).max(20).default([]),
})

export const SupplementSchema = z.object({
  key:    Key,
  name:   ShortText,
  dose:   ShortText,
  timing: ShortText.optional(),
  notes:  Text.optional(),
  /** Expected water-weight gain window (weeks after starting) — explains a flat scale. */
  waterWeightWeeks: z.number().int().min(1).max(12).optional(),
  caveats: z.array(ShortText).max(10).default([]),
})

// ── Tracking, adjustments, milestones, outcomes ─────────────────────────────

export const TrackingSchema = z.object({
  metrics:    z.array(z.object({ metric: ShortText, frequency: ShortText })).max(30).default([]),
  doNotTrack: z.array(ShortText).max(20).default([]),
})

export const AdjustmentRuleSchema = z.object({
  everyWeeks: z.number().int().min(1).max(8),
  bands: z.array(z.object({
    /** Loss over the period (kg) — inclusive min, exclusive max; omit for open-ended. */
    lossMinKg: z.number().optional(),
    lossMaxKg: z.number().optional(),
    kcalChange: z.number().int().min(-1000).max(1000),
    label: ShortText,
  })).max(10),
  minWeighInsPerWeek: z.number().int().min(1).max(7).default(5),
  preferredLossKgPerWeek: z.tuple([z.number(), z.number()]).optional(),
})

export const MilestoneSchema = z.object({
  week:     z.number().int().min(1).max(104),
  tasks:    z.array(ShortText).max(20).default([]),
  expected: z.array(ShortText).max(10).default([]),
})

export const OutcomeSchema = z.object({
  expectations: z.array(Text).max(10).default([]),
  escalation:   z.array(z.object({ metric: ShortText, threshold: z.number(), unit: ShortText, note: Text })).max(10).default([]),
})

// ── The whole programme ─────────────────────────────────────────────────────

export const ProgrammeDefinitionSchema = z.object({
  schemaVersion:   z.literal(1).default(1),
  identity:        IdentitySchema,
  energy:          EnergySchema.optional(),
  macros:          MacrosSchema.optional(),
  components:      z.array(ComponentSchema).max(30).default([]),
  mealSlots:       z.array(MealSlotSchema).max(12).default([]),
  mealRotation:    MealRotationSchema.optional(),
  nutritionRules:  z.array(NutritionRuleSchema).max(30).default([]),
  eatingOut:       z.array(ShortText).max(40).default([]),
  trainingSessions: z.array(TrainingSessionSchema).max(10).default([]),
  weeklySchedule:  WeeklyScheduleSchema.optional(),
  blocks:          z.array(BlockSchema).max(12).default([]),
  progression:     ProgressionSchema.optional(),
  movementRestrictions: MovementRestrictionsSchema.optional(),
  painRules:       PainRulesSchema.optional(),
  cardio:          CardioSchema.optional(),
  dailyMovement:   DailyMovementSchema.optional(),
  sleep:           SleepSchema.optional(),
  supplements:     z.array(SupplementSchema).max(20).default([]),
  tracking:        TrackingSchema.optional(),
  adjustment:      AdjustmentRuleSchema.optional(),
  milestones:      z.array(MilestoneSchema).max(30).default([]),
  outcomes:        OutcomeSchema.optional(),
}).superRefine((p, ctx) => {
  const dupes = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i)
  for (const [path, keys] of [
    ['components', p.components.map(c => c.key)],
    ['mealSlots', p.mealSlots.map(s => s.key)],
    ['trainingSessions', p.trainingSessions.map(s => s.key)],
    ['blocks', p.blocks.map(b => b.key)],
    ['supplements', p.supplements.map(s => s.key)],
  ] as const) {
    const d = dupes([...keys])
    if (d.length > 0) ctx.addIssue({ code: 'custom', path: [path], message: `Duplicate keys: ${d.join(', ')}` })
  }
  const sessionKeys = new Set(p.trainingSessions.map(s => s.key))
  for (const day of p.weeklySchedule?.days ?? []) {
    if (day.session && !sessionKeys.has(day.session)) {
      ctx.addIssue({ code: 'custom', path: ['weeklySchedule'], message: `Unknown session ${day.session}` })
    }
  }
  const sat = p.macros?.satFat
  if (sat?.targetG !== undefined && sat.ceilingG !== undefined && sat.ceilingG < sat.targetG) {
    ctx.addIssue({ code: 'custom', path: ['macros', 'satFat'], message: 'Saturated fat ceiling must be ≥ target' })
  }
})

export type ProgrammeDefinition = z.infer<typeof ProgrammeDefinitionSchema>
export type ProgrammeDefinitionInput = z.input<typeof ProgrammeDefinitionSchema>

/** Parse a stored definition (jsonb). Invalid → null (callers show a friendly error, never crash). */
export function parseProgrammeDefinition(raw: unknown): ProgrammeDefinition | null {
  const r = ProgrammeDefinitionSchema.safeParse(raw)
  return r.success ? r.data : null
}
