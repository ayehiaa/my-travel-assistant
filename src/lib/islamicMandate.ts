import { MAX_STOCK_WEIGHT_PCT } from '@/lib/shariahRules'
import { FULL_SCREENING_CONFIG, isFullScreening, type EffectiveScreeningConfig } from '@/lib/screeningConfig'

/**
 * Shared ISLAMIC MANDATE block appended to every agent and synthesizer system prompt (full screening = spec 019).
 * Prompts guide the models; the binding enforcement is in code (src/lib/shariahRules.ts,
 * the Shariah reviewer step and the execution guards).
 */
export const ISLAMIC_MANDATE =
  '\n\n--- ISLAMIC MANDATE (binding for this investor) ---\n' +
  'This investor only holds Shariah-compliant INDIVIDUAL COMMON STOCKS. Every idea you discuss or recommend must respect this:\n' +
  '  - Allowed: individual common stocks of companies whose main business is permissible and which pass Shariah (AAOIFI) screening.\n' +
  '  - Forbidden instruments: bonds and other fixed income, ETFs, mutual funds and any pooled fund, preferred shares, ' +
  'options, futures and other derivatives, short selling, margin / leverage, interest-bearing deposits.\n' +
  '  - Forbidden business activities: conventional banking, insurance and other interest-based finance, alcohol, pork, ' +
  'tobacco, gambling, adult entertainment, weapons / defence.\n' +
  '  - Financial screens: interest-bearing debt, cash + interest-bearing securities, and receivables must each be under 30% of ' +
  'market capitalisation; non-permissible income must be under 5% of revenue.\n' +
  `  - Position limit: no single stock may exceed ${MAX_STOCK_WEIGHT_PCT}% of the portfolio.\n` +
  '  - Do not suggest a ticker because it is popular; if you are unsure whether a company is compliant, do not recommend it.\n' +
  '  - Every ticker is independently screened in code afterwards; non-compliant tickers will be removed and sold.\n'

/**
 * The mandate for the effective screening config (specs/030):
 * - full config → exactly ISLAMIC_MANDATE;
 * - Islamic on with some parts → an Islamic mandate naming only the enabled parts (+ stocks-only wording when on);
 * - Islamic off + stocks-only → a short investment mandate (individual common stocks only);
 * - everything off → '' (no mandate).
 */
export function buildScreeningMandate(cfg: EffectiveScreeningConfig): string {
  if (isFullScreening(cfg)) return ISLAMIC_MANDATE
  if (!cfg.islamic && !cfg.stocks_only) return ''

  if (!cfg.islamic) {
    return (
      '\n\n--- INVESTMENT MANDATE (binding for this investor) ---\n' +
      'This investor only holds INDIVIDUAL COMMON STOCKS:\n' +
      '  - Forbidden instruments: ETFs, mutual funds and any pooled fund, bonds and other fixed income, preferred shares.\n' +
      `  - Position limit: no single stock may exceed ${MAX_STOCK_WEIGHT_PCT}% of the portfolio.\n` +
      '  - Every ticker is checked in code afterwards; anything that is not a common stock will be removed and sold.\n'
    )
  }

  const lines: string[] = []
  lines.push(cfg.stocks_only
    ? 'This investor only holds Shariah-compliant INDIVIDUAL COMMON STOCKS. Every idea you discuss or recommend must respect this:'
    : 'This investor only holds Shariah-compliant investments. Every idea you discuss or recommend must respect this:')
  lines.push(cfg.stocks_only
    ? '  - Forbidden instruments: bonds and other fixed income, ETFs, mutual funds and any pooled fund, preferred shares, ' +
      'options, futures and other derivatives, short selling, margin / leverage, interest-bearing deposits.'
    : '  - Forbidden instruments: bonds and other fixed income, options, futures and other derivatives, short selling, ' +
      'margin / leverage, interest-bearing deposits. A fund or ETF is only acceptable if it is an explicitly Shariah-compliant fund.')
  if (cfg.business) {
    lines.push('  - Forbidden business activities: conventional banking, insurance and other interest-based finance, alcohol, pork, ' +
      'tobacco, gambling, adult entertainment, weapons / defence.')
  }
  if (cfg.financial) {
    lines.push('  - Financial screens: interest-bearing debt, cash + interest-bearing securities, and receivables must each be under 30% of ' +
      'market capitalisation; non-permissible income must be under 5% of revenue.')
  }
  lines.push(`  - Position limit: no single stock may exceed ${MAX_STOCK_WEIGHT_PCT}% of the portfolio.`)
  lines.push('  - Do not suggest a ticker because it is popular; if you are unsure whether it passes these screens, do not recommend it.')
  lines.push('  - Every ticker is independently screened in code afterwards; tickers that fail will be removed and sold.')
  return '\n\n--- ISLAMIC MANDATE (binding for this investor) ---\n' + lines.join('\n') + '\n'
}

/** Append the mandate for `cfg` (default: full screening) to a system prompt. */
export function withIslamicMandate(systemPrompt: string, cfg: EffectiveScreeningConfig = FULL_SCREENING_CONFIG): string {
  return systemPrompt + buildScreeningMandate(cfg)
}
