/**
 * The ticker line shared by every agent's portfolio context.
 * For a brand-new portfolio (cash only) the tickers are starter candidates, not holdings.
 */
export function describeTickers(tickers: string[], isNewPortfolio?: boolean): string {
  if (isNewPortfolio) {
    return (
      'New portfolio: the account holds only cash and no positions yet. ' +
      `Candidate stocks under consideration: ${tickers.join(', ')}. ` +
      'Assess them as potential first purchases, not existing positions.'
    )
  }
  return `Holdings: ${tickers.join(', ')}`
}
