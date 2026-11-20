import type { RiskProfile } from '@/types/database'

/**
 * Candidate stocks researched when an account has cash but no positions.
 * Individual common stocks only (no ETFs, funds, bonds or preferreds), chosen to lean
 * Shariah-compliant: no banks, insurers, alcohol, tobacco, gambling or defence companies,
 * and no ADRs (which fail the code-level "CS" stocks-only check).
 * Being listed here is NOT a compliance verdict — every ticker is still screened in code
 * and by the Shariah reviewer on every run.
 */
const BY_RISK: Record<RiskProfile, string[]> = {
  conservative: ['MSFT', 'AAPL', 'JNJ', 'PG', 'ABT', 'MRK', 'CL', 'LIN', 'KO'],
  moderate:     ['MSFT', 'AAPL', 'GOOGL', 'LLY', 'ABT', 'TXN', 'CSCO', 'ADBE', 'LIN', 'NKE'],
  aggressive:   ['NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMD', 'AVGO', 'TSLA', 'CRWD', 'NOW', 'ADBE', 'META'],
}

export function getStarterUniverse(riskProfile: RiskProfile): string[] {
  return Array.from(new Set(BY_RISK[riskProfile] ?? BY_RISK.moderate))
}
