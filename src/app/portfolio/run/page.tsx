import { redirect } from 'next/navigation'

/** Run Analysis moved into the Portfolio hub's Rebalance tab (specs/025-portfolio-trading-hub). */
export default function RunPage() {
  redirect('/portfolio?tab=rebalance')
}
