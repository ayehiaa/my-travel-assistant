'use client'

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatChartValue, nearestPoint, niceTicks, scaleLineChart, type ChartUnit } from '@/lib/chartPath'

interface Props {
  values: Array<number | null>
  /** Accessible title and description (rendered as <title>/<desc>). */
  title: string
  description: string
  /** Dashed reference line, e.g. the period's starting value. */
  baseline?: number | null
  /** Colour comes from the text colour (currentColor) so it follows the theme. */
  className?: string
  startLabel?: string
  endLabel?: string
  /** One label per value (e.g. its date), shown while scrubbing. */
  pointLabels?: string[]
  /** Unit for the value axis and the scrub readout. */
  unit?: ChartUnit
}

const BOX = { width: 600, height: 200, pad: 8 }
const pct = (v: number, of: number) => `${(v / of) * 100}%`

/**
 * Lightweight inline SVG line chart (no chart dependency) with a value axis and a touch / mouse scrubber:
 * put a finger (or the pointer) on the chart and slide — a vertical line follows it with the value and date.
 * Arrow keys scrub when the chart has focus.
 */
export default function LineChart({
  values, title, description, baseline, className = '', startLabel, endLabel, pointLabels, unit = 'number',
}: Props) {
  const id = useId()
  const axis = useMemo(() => {
    const finite = values.filter((v): v is number => v !== null && Number.isFinite(v))
    if (baseline !== null && baseline !== undefined && Number.isFinite(baseline)) finite.push(baseline)
    return finite.length ? niceTicks(Math.min(...finite), Math.max(...finite), 4) : null
  }, [values, baseline])
  const chart = useMemo(
    () => scaleLineChart(values, BOX, baseline, axis ? { min: axis.min, max: axis.max } : undefined),
    [values, baseline, axis],
  )
  const [active, setActive] = useState<number | null>(null)

  if (!chart.line || !axis) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg bg-[var(--paper-2)] text-sm text-[var(--ink-3)] md:h-52">
        Not enough history yet for this period.
      </div>
    )
  }

  const yOf = (v: number) => BOX.pad + (1 - (v - chart.min) / (chart.max - chart.min || 1)) * (BOX.height - BOX.pad * 2)

  function scrubTo(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const x = ((e.clientX - rect.left) / rect.width) * BOX.width
    setActive(nearestPoint(chart.points, x))
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = chart.points.length - 1
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const from = active ?? (e.key === 'ArrowLeft' ? last + 1 : -1)
      setActive(Math.min(last, Math.max(0, from + (e.key === 'ArrowRight' ? 1 : -1))))
    } else if (e.key === 'Escape') {
      setActive(null)
    }
  }

  const point = active !== null ? chart.points[active] : null
  const first = chart.points[0]
  const change = point ? point.v - first.v : 0
  const changePct = point && first.v !== 0 ? (change / Math.abs(first.v)) * 100 : null
  const gradientId = `${id}-fill`
  // Keep the readout inside the chart: anchor left / centre / right depending on where the finger is
  const xFrac = point ? point.x / BOX.width : 0
  const anchor = xFrac < 0.25 ? 'translate-x-0' : xFrac > 0.75 ? '-translate-x-full' : '-translate-x-1/2'

  return (
    <figure className={className}>
      <div className="flex">
        {/* Value axis */}
        <div className="relative h-40 w-16 shrink-0 md:h-52" aria-hidden="true">
          {axis.ticks.map(t => (
            <span
              key={t}
              className="absolute right-2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] leading-none text-[var(--ink-4)]"
              style={{ top: pct(yOf(t), BOX.height) }}
            >
              {formatChartValue(t, unit, axis.step)}
            </span>
          ))}
        </div>

        <div
          className="relative h-40 min-w-0 flex-1 cursor-crosshair touch-pan-y select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-4)] md:h-52"
          tabIndex={0}
          aria-label={`${title}. Use left and right arrow keys to read values.`}
          onPointerDown={scrubTo}
          onPointerMove={scrubTo}
          onPointerLeave={() => setActive(null)}
          onPointerCancel={() => setActive(null)}
          onPointerUp={e => { if (e.pointerType !== 'mouse') setActive(null) }}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          <svg
            viewBox={`0 0 ${BOX.width} ${BOX.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={`${id}-title ${id}-desc`}
            className="absolute inset-0 block h-full w-full overflow-visible"
          >
            <title id={`${id}-title`}>{title}</title>
            <desc id={`${id}-desc`}>{description}</desc>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            {axis.ticks.map(t => (
              <line
                key={t}
                x1={0}
                x2={BOX.width}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke="var(--rule)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {chart.baselineY !== null && (
              <line
                x1={0}
                x2={BOX.width}
                y1={chart.baselineY}
                y2={chart.baselineY}
                stroke="var(--ink-4)"
                strokeWidth={1}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path d={chart.area} fill={`url(#${gradientId})`} stroke="none" />
            <path
              d={chart.line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {point && (
              <>
                <line
                  x1={point.x}
                  x2={point.x}
                  y1={0}
                  y2={BOX.height}
                  stroke="var(--ink-3)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                {/* Zero-length line with round caps = a dot that stays round despite preserveAspectRatio="none" */}
                <line x1={point.x} x2={point.x} y1={point.y} y2={point.y} stroke="white" strokeWidth={12} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                <line x1={point.x} x2={point.x} y1={point.y} y2={point.y} stroke="currentColor" strokeWidth={8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>

          {point && (
            <div
              className={`pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-white shadow-lg ${anchor}`}
              style={{ left: pct(point.x, BOX.width) }}
              role="status"
              aria-live="polite"
            >
              <div className="whitespace-nowrap font-mono text-sm font-semibold">{formatChartValue(point.v, unit)}</div>
              <div className="whitespace-nowrap text-[11px] opacity-80">
                {pointLabels?.[point.i] ? `${pointLabels[point.i]} · ` : ''}
                {change >= 0 ? '+' : ''}
                {formatChartValue(change, unit)}
                {changePct !== null ? ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)` : ''}
              </div>
            </div>
          )}
        </div>
      </div>
      {(startLabel || endLabel) && (
        <figcaption className="mt-1 flex justify-between pl-16 text-xs text-[var(--ink-4)]" aria-hidden="true">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </figcaption>
      )}
    </figure>
  )
}
