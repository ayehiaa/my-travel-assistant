/**
 * Pure SVG line-chart scaling (specs/025-portfolio-trading-hub). No chart dependency.
 */

export interface ChartBox {
  width: number
  height: number
  /** Inner padding so the stroke is never clipped. */
  pad: number
}

export interface ScaledChart {
  /** "M x y L x y …" through every finite point; empty string when fewer than 2 points. */
  line: string
  /** Closed area under the line (for a soft fill); empty when `line` is empty. */
  area: string
  min: number
  max: number
  /** Scaled coordinates of the last point (for an end marker). */
  last: { x: number; y: number } | null
  /** y coordinate of `baseline` when given and inside [min, max]. */
  baselineY: number | null
  /** Every finite point, scaled (for scrubbing / tooltips). `i` is the index into the input values. */
  points: Array<{ i: number; v: number; x: number; y: number }>
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Scale values (nulls/non-finite skipped, x spacing kept by index) into the box.
 * A flat series is drawn through the vertical middle. `baseline` (e.g. the period's starting value) widens the
 * range so it is always visible.
 */
export function scaleLineChart(
  values: Array<number | null>,
  box: ChartBox,
  baseline?: number | null,
  /** Fixed y range (e.g. from niceTicks) so gridlines line up; widened if a value falls outside. */
  domain?: { min: number; max: number },
): ScaledChart {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v))

  if (pts.length < 2) {
    return { line: '', area: '', min: pts[0]?.v ?? 0, max: pts[0]?.v ?? 0, last: null, baselineY: null, points: [] }
  }

  let min = Math.min(...pts.map(p => p.v))
  let max = Math.max(...pts.map(p => p.v))
  const hasBaseline = baseline !== null && baseline !== undefined && Number.isFinite(baseline)
  if (hasBaseline) {
    min = Math.min(min, baseline)
    max = Math.max(max, baseline)
  }
  if (domain && Number.isFinite(domain.min) && Number.isFinite(domain.max) && domain.max > domain.min) {
    min = Math.min(min, domain.min)
    max = Math.max(max, domain.max)
  }

  const innerW = Math.max(1, box.width - box.pad * 2)
  const innerH = Math.max(1, box.height - box.pad * 2)
  const span = values.length - 1 || 1
  const range = max - min
  const x = (i: number) => round(box.pad + (i / span) * innerW)
  const y = (v: number) => round(range === 0 ? box.pad + innerH / 2 : box.pad + (1 - (v - min) / range) * innerH)

  const coords = pts.map(p => ({ x: x(p.i), y: y(p.v) }))
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x} ${c.y}`).join(' ')
  const bottom = round(box.height - box.pad)
  const area = `${line} L${coords[coords.length - 1].x} ${bottom} L${coords[0].x} ${bottom} Z`

  return {
    line,
    area,
    min,
    max,
    last: coords[coords.length - 1],
    baselineY: hasBaseline ? y(baseline) : null,
    points: pts.map((p, k) => ({ i: p.i, v: p.v, x: coords[k].x, y: coords[k].y })),
  }
}

// ── Axis + scrubbing helpers ────────────────────────────────────────────────

/** A "nice" step (1, 2, 2.5 or 5 × 10^n) so that about `count` intervals cover `range`. */
function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return nice * mag
}

/**
 * Round axis ticks covering [min, max] (about `count` intervals). A flat series gets a small band around its value.
 * Returns ticks from low to high plus the step (used to pick label precision). Pure.
 */
export function niceTicks(lowIn: number, highIn: number, count = 4): { ticks: number[]; step: number; min: number; max: number } {
  if (!Number.isFinite(lowIn) || !Number.isFinite(highIn)) return { ticks: [], step: 0, min: 0, max: 0 }
  let low = Math.min(lowIn, highIn)
  let high = Math.max(lowIn, highIn)
  if (high === low) {
    const pad = Math.abs(low) * 0.01 || 1
    low -= pad
    high += pad
  }
  const step = niceStep(high - low, count)
  const lo = Math.floor(low / step) * step
  const hi = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step)
  return { ticks, step, min: lo, max: hi }
}

/** Index (into `points`) of the point whose x is closest to `x`. -1 when there are no points. Pure. */
export function nearestPoint(points: Array<{ x: number }>, x: number): number {
  if (points.length === 0) return -1
  let best = 0
  for (let k = 1; k < points.length; k++) {
    if (Math.abs(points[k].x - x) < Math.abs(points[best].x - x)) best = k
  }
  return best
}

export type ChartUnit = 'usd' | 'kg' | 's' | 'number'

/** Axis / tooltip label. `step` (axis spacing) decides decimals; omit it for a full-precision tooltip value. Pure. */
export function formatChartValue(v: number, unit: ChartUnit, step?: number): string {
  // Axis labels use as many decimals as the step needs (200 → 0, 2.5 → 1, 0.25 → 2)
  const decimals = step === undefined ? (unit === 'usd' ? 2 : 1) : [0, 1, 2].find(d => Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-9) ?? 2
  const num = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const sign = v < 0 ? '-' : ''
  if (unit === 'usd') return `${sign}$${num}`
  if (unit === 'kg') return `${sign}${num} kg`
  if (unit === 's') return `${sign}${num} s`
  return `${sign}${num}`
}
