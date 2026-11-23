'use client'

import { useId, useMemo, useState } from 'react'
import { CHART_RANGES, sliceRange, type ChartRange } from '@/lib/health/lifestyleUi'

export interface TrendPoint { date: string; line: number | null; dot: number | null }

const W = 600
const H = 200
const PAD = { l: 8, r: 8, t: 12, b: 12 }

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * Line (e.g. 7-day average) + dots (daily values) with 1M / 3M / All range chips (specs/032). Aspect ratio is kept so
 * the dots stay round; the optional baseline is dashed.
 */
export default function TrendChart({ points, today, title, unit, baseline = null, initialRange = '3m' }: {
  points: TrendPoint[]; today: string; title: string; unit: string; baseline?: number | null; initialRange?: ChartRange
}) {
  const id = useId()
  const [range, setRange] = useState<ChartRange>(initialRange)
  const shown = useMemo(() => sliceRange(points, range, today), [points, range, today])
  const values = shown.flatMap(p => [p.line, p.dot]).filter((v): v is number => v !== null)
  if (baseline !== null) values.push(baseline)

  const chips = (
    <div className="flex gap-1" role="group" aria-label={`${title} range`}>
      {CHART_RANGES.map(r => (
        <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}
          className={`min-h-9 min-w-11 rounded-full px-3 text-xs font-bold ${range === r.key ? 'bg-[var(--ink)] text-white' : 'bg-[var(--paper-2)] text-[var(--ink-2)]'}`}>
          {r.label}
        </button>
      ))}
    </div>
  )

  if (shown.length < 2 || values.length < 2) {
    return (
      <div>
        <div className="mb-2 flex justify-end">{chips}</div>
        <p className="grid h-32 place-items-center rounded-lg bg-[var(--paper-2)] text-sm text-[var(--ink-3)]">Not enough data yet</p>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = shown.length
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b)
  let d = ''
  let pen = false
  shown.forEach((p, i) => {
    if (p.line === null) { pen = false; return }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.line).toFixed(1)}`
    pen = true
  })
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString()

  return (
    <figure>
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-xs text-[var(--ink-3)]">{fmt(min)}–{fmt(max)} {unit}</figcaption>
        {chips}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} className="block h-auto w-full text-[var(--blue-700)]">
        <title id={`${id}-t`}>{`${title}, ${fmtDay(shown[0].date)} to ${fmtDay(shown[n - 1].date)}`}</title>
        {baseline !== null && <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline)} y2={y(baseline)} stroke="var(--ink-4)" strokeWidth={1.5} strokeDasharray="6 6" />}
        {shown.map((p, i) => (p.dot === null ? null : <circle key={p.date} cx={x(i)} cy={y(p.dot)} r={3.5} className="fill-[var(--ink-4)]" />))}
        <path d={d} fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-[var(--ink-4)]" aria-hidden="true">
        <span>{fmtDay(shown[0].date)}</span>
        <span>{fmtDay(shown[n - 1].date)}</span>
      </div>
    </figure>
  )
}
