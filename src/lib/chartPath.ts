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
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Scale values (nulls/non-finite skipped, x spacing kept by index) into the box.
 * A flat series is drawn through the vertical middle. `baseline` (e.g. the period's starting value) widens the
 * range so it is always visible.
 */
export function scaleLineChart(values: Array<number | null>, box: ChartBox, baseline?: number | null): ScaledChart {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v))

  if (pts.length < 2) {
    return { line: '', area: '', min: pts[0]?.v ?? 0, max: pts[0]?.v ?? 0, last: null, baselineY: null }
  }

  let min = Math.min(...pts.map(p => p.v))
  let max = Math.max(...pts.map(p => p.v))
  const hasBaseline = baseline !== null && baseline !== undefined && Number.isFinite(baseline)
  if (hasBaseline) {
    min = Math.min(min, baseline)
    max = Math.max(max, baseline)
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
  }
}
