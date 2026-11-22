import type { ProgrammeDefinition } from './programmeSchema'
import { computeTargets, TARGET_KEYS, type EffectiveTargets, type Profile, type TargetOverrides } from './targets'

/**
 * Targets after a programme edit (phase P3). Pure.
 *
 * Only an edit that changes the computed targets (energy / macros) moves them. Accepted fortnightly adjustments are
 * carried over: the difference between the current effective targets and what the OLD definition computes for the
 * same profile is re-applied on top of what the NEW definition computes.
 */
export function retargetAfterEdit(
  oldDef: ProgrammeDefinition,
  newDef: ProgrammeDefinition,
  profile: Profile | null,
  overrides: TargetOverrides,
  current: EffectiveTargets,
): { targets: EffectiveTargets; changed: boolean } {
  if (!profile) return { targets: current, changed: false }
  const before = computeTargets(oldDef, profile, overrides).targets
  const after = computeTargets(newDef, profile, overrides).targets
  if (TARGET_KEYS.every(k => before[k] === after[k])) return { targets: current, changed: false }
  const out = { ...after }
  for (const k of TARGET_KEYS) out[k] = Math.max(0, after[k] + (current[k] - before[k]))
  return { targets: out, changed: TARGET_KEYS.some(k => out[k] !== current[k]) }
}

/** Targets for a fresh enrolment in another programme: same profile, no carried-over overrides or adjustments. */
export function targetsForSwitch(def: ProgrammeDefinition, profile: Profile): EffectiveTargets {
  return computeTargets(def, profile, {}).targets
}
