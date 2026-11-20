import { MAX_STOCK_WEIGHT_PCT } from '@/lib/shariahRules'

/**
 * Shared ISLAMIC MANDATE block appended to every agent and synthesizer system prompt.
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

/** Append the mandate to a system prompt. */
export function withIslamicMandate(systemPrompt: string): string {
  return systemPrompt + ISLAMIC_MANDATE
}
