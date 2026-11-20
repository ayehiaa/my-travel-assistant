import { useId } from 'react'
import { scaleLineChart } from '@/lib/chartPath'

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
}

const BOX = { width: 600, height: 200, pad: 6 }

/** Lightweight inline SVG line chart (no chart dependency). Scales to its container width. */
export default function LineChart({ values, title, description, baseline, className = '', startLabel, endLabel }: Props) {
  const id = useId()
  const chart = scaleLineChart(values, BOX, baseline)

  if (!chart.line) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg bg-[var(--paper-2)] text-sm text-[var(--ink-3)] md:h-52">
        Not enough history yet for this period.
      </div>
    )
  }

  const gradientId = `${id}-fill`
  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className="block h-40 w-full md:h-52"
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{description}</desc>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.18} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {chart.baselineY !== null && (
          <line
            x1={BOX.pad}
            x2={BOX.width - BOX.pad}
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
      </svg>
      {(startLabel || endLabel) && (
        <figcaption className="mt-1 flex justify-between text-xs text-[var(--ink-4)]" aria-hidden="true">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </figcaption>
      )}
    </figure>
  )
}
