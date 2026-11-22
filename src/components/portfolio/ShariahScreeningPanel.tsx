import { RATIO_LABELS, SHARIAH_RATIO_LIMIT_PCT, screeningCoversConfig } from '@/lib/shariahRules'
import { FULL_SCREENING_CONFIG, describeScreeningConfig, type EffectiveScreeningConfig } from '@/lib/screeningConfig'
import type { RatioKey, ScreeningRatio, ShariahScreeningResult, TickerScreening } from '@/types/shariah'

interface Props {
  screening: ShariahScreeningResult | null
  /** The user's CURRENT screening config (specs/030); defaults to full screening. */
  current?: EffectiveScreeningConfig
}

const CHECK_LABEL = { stocks_only: 'stocks only', business: 'business activity', financial: 'financial ratios' } as const

/** "Not applied: financial ratios (would fail)" — disabled checks are shown for information only (specs/030). */
export function notAppliedSummary(t: TickerScreening): string | null {
  if (!t.checks) return null
  const parts = (Object.keys(CHECK_LABEL) as Array<keyof typeof CHECK_LABEL>)
    .filter(k => !t.checks![k].applied)
    .map(k => {
      const o = t.checks![k].outcome
      return `${CHECK_LABEL[k]}${o === 'fail' ? ' (would fail)' : o === 'pass' ? ' (would pass)' : ''}`
    })
  return parts.length > 0 ? `Not applied: ${parts.join(', ')}` : null
}

const RATIO_KEYS: RatioKey[] = ['debt', 'cash_and_securities', 'receivables']

const SOURCE_LABEL: Record<ScreeningRatio['source'], string> = {
  polygon:     'Polygon',
  ai_estimate: 'AI estimate',
  unavailable: 'unavailable',
}

function ratioText(r: ScreeningRatio): string {
  if (r.value_pct === null) return '—'
  const prefix = r.basis === 'upper_bound' ? '≤ ' : ''
  return `${prefix}${r.value_pct.toFixed(1)}%`
}

function ratioColour(r: ScreeningRatio): string {
  if (r.status === 'pass') return 'text-green-700'
  if (r.status === 'fail') return 'text-red-700'
  return 'text-gray-500'
}

export default function ShariahScreeningPanel({ screening, current = FULL_SCREENING_CONFIG }: Props) {
  if (!screening && !current.islamic) {
    return (
      <p className="rounded-lg border border-[var(--rule)] bg-[var(--paper-2)] px-4 py-3 text-sm text-[var(--ink-2)]">
        {current.stocks_only
          ? 'Islamic screening is off. This recommendation has no screening data, so buys are blocked until the analysis is ' +
            're-run to confirm each ticker is an individual common stock. Sells are still allowed.'
          : 'Screening is off — buys from this recommendation are not checked.'}
      </p>
    )
  }
  if (!screening) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This recommendation was created before Shariah screening. Buys from it are blocked — re-run the analysis to
        get a screened recommendation. Sells are still allowed.
      </p>
    )
  }

  const screenedAt = new Date(screening.screened_at)
  const runConfig = screening.config ?? FULL_SCREENING_CONFIG
  const covered = screeningCoversConfig(screening, current)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold text-[var(--ink-2)]">{describeScreeningConfig(runConfig)} (this recommendation)</p>
      {!covered && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your current settings ({describeScreeningConfig(current).replace('Screening: ', '')}) include checks this
          recommendation was not screened for. Buys from it are blocked — re-run the analysis. Sells are still allowed.
        </p>
      )}
      <p className="text-sm text-gray-600">
        {runConfig.stocks_only ? 'Individual common stocks only. ' : ''}
        {runConfig.financial
          ? `Each ratio must be under ${SHARIAH_RATIO_LIMIT_PCT}% of market cap and non-permissible income under 5% of revenue. `
          : ''}
        {runConfig.islamic && !runConfig.financial ? 'Financial ratios are shown for information only (not applied). ' : ''}
        {!runConfig.islamic ? 'Islamic screening was off for this run — ratios are not applied. ' : ''}
        Screened{' '}
        {Number.isNaN(screenedAt.getTime()) ? '' : screenedAt.toLocaleString('en-GB')}.
      </p>

      {/* Mobile: stacked cards (no horizontal scroll at 375px) */}
      <ul className="space-y-2 md:hidden">
        {screening.tickers.map(t => (
          <li key={t.ticker} className="rounded-lg border border-gray-200 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-gray-900">{t.ticker}</span>
                {t.is_holding && <span className="ml-2 text-xs text-gray-500">Held</span>}
                {t.name && <div className="truncate text-xs text-gray-500">{t.name}</div>}
              </div>
              <span
                className={
                  t.verdict === 'compliant'
                    ? 'shrink-0 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700'
                    : 'shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'
                }
              >
                {t.verdict === 'compliant' ? (runConfig.islamic ? 'Compliant' : 'Eligible') : (runConfig.islamic ? 'Not compliant' : 'Excluded')}
              </span>
            </div>
            <p className="mt-1 break-words text-gray-700">{t.reasons[0] ?? '—'}</p>
            {notAppliedSummary(t) && <p className="text-xs text-gray-500">{notAppliedSummary(t)}</p>}
            {t.non_permissible_income_pct !== null && (
              <p className="text-xs text-gray-500">Non-permissible income ≈ {t.non_permissible_income_pct.toFixed(1)}%</p>
            )}
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {RATIO_KEYS.map(k => {
                const r = t.ratios[k]
                return (
                  <div key={k} className="min-w-0">
                    <dt className="truncate text-gray-500" title={RATIO_LABELS[k]}>
                      {k === 'debt' ? 'Debt' : k === 'cash_and_securities' ? 'Cash + sec.' : 'Receivables'}
                    </dt>
                    <dd className={`font-semibold ${ratioColour(r)}`}>{ratioText(r)}</dd>
                    <dd className="truncate text-gray-500">{SOURCE_LABEL[r.source]}</dd>
                  </div>
                )
              })}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3">Ticker</th>
              <th className="py-2 pr-3">Verdict</th>
              <th className="py-2 pr-3">Reason</th>
              {RATIO_KEYS.map(k => (
                <th key={k} className="py-2 pr-3" title={RATIO_LABELS[k]}>
                  {k === 'debt' ? 'Debt' : k === 'cash_and_securities' ? 'Cash + securities' : 'Receivables'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {screening.tickers.map(t => (
              <tr key={t.ticker} className="border-b border-gray-100 align-top">
                <td className="py-2 pr-3 font-semibold text-gray-900">
                  {t.ticker}
                  {t.name && <div className="text-xs font-normal text-gray-500">{t.name}</div>}
                  {t.is_holding && <div className="text-xs font-normal text-gray-500">Held</div>}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={
                      t.verdict === 'compliant'
                        ? 'inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700'
                        : 'inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'
                    }
                  >
                    {t.verdict === 'compliant' ? (runConfig.islamic ? 'Compliant' : 'Eligible') : (runConfig.islamic ? 'Not compliant' : 'Excluded')}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-700">
                  {t.reasons[0] ?? '—'}
                  {notAppliedSummary(t) && <div className="text-xs text-gray-500">{notAppliedSummary(t)}</div>}
                  {t.non_permissible_income_pct !== null && (
                    <div className="text-xs text-gray-500">
                      Non-permissible income ≈ {t.non_permissible_income_pct.toFixed(1)}%
                    </div>
                  )}
                </td>
                {RATIO_KEYS.map(k => {
                  const r = t.ratios[k]
                  return (
                    <td key={k} className="py-2 pr-3">
                      <span className={ratioColour(r)}>{ratioText(r)}</span>
                      <div className="text-xs text-gray-500">{SOURCE_LABEL[r.source]}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {screening.excluded.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold text-red-800">Excluded</h3>
          <ul className="flex flex-col gap-1 text-sm text-red-900">
            {screening.excluded.map(e => (
              <li key={e.ticker}>
                <span className="font-semibold">{e.ticker}</span> — {e.reasons.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
