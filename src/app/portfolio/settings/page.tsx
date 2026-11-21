import { redirect } from 'next/navigation'
import { parseSettingsSection, settingsHref } from '@/lib/portfolioHub'

/**
 * Portfolio Settings live in the hub's Settings tab (specs/025), split into sections (specs/028).
 * Old links (e-mails, bookmarks) land on Setup, or on the section named by ?section= (legacy anchor names accepted).
 */
export default async function PortfolioSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  redirect(settingsHref(parseSettingsSection(params.section)))
}
