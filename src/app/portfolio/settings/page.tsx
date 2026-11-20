import { redirect } from 'next/navigation'

/** Portfolio Settings moved into the Portfolio hub's Settings tab (specs/025-portfolio-trading-hub). */
export default function PortfolioSettingsPage() {
  redirect('/portfolio?tab=settings')
}
