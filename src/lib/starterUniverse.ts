import type { RiskProfile } from '@/types/database'

/**
 * Candidate instruments researched when an account has cash but no positions.
 * The synthesizer may pick from these or propose other valid US tickers; these only
 * give the per-ticker agents (fundamentals, technicals, sectors, sentiment) something
 * concrete to analyse.
 */
const CORE = ['VTI', 'VOO', 'VXUS']

const BY_RISK: Record<RiskProfile, string[]> = {
  conservative: ['BND', 'AGG', 'SCHD', 'VIG', 'XLV', 'XLP', 'MSFT'],
  moderate:     ['QQQ', 'SCHD', 'BND', 'XLV', 'MSFT', 'AAPL', 'GOOGL'],
  aggressive:   ['QQQ', 'SMH', 'XLK', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META'],
}

export function getStarterUniverse(riskProfile: RiskProfile): string[] {
  const extra = BY_RISK[riskProfile] ?? BY_RISK.moderate
  return Array.from(new Set([...CORE, ...extra]))
}
