import Link from 'next/link'
import { HUB_TABS, HUB_TAB_LABELS, hubHref, type HubTab } from '@/lib/portfolioHub'

interface Props {
  active: HubTab
}

const ICON_PATHS: Record<HubTab, string> = {
  overview:  'M3 12l2-2 4 4 6-6 6 6M3 20h18',
  rebalance: 'M4 7h13l-3-3M20 17H7l3 3',
  activity:  'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  settings:  'M4 6h16M4 12h16M4 18h16M9 4v4M15 10v4M7 16v4',
}

function TabIcon({ tab }: { tab: HubTab }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[tab]} />
    </svg>
  )
}

/** Hub navigation: top tabs on desktop, fixed bottom tab bar on small screens. Tabs live in the URL (?tab=). */
export default function HubTabs({ active }: Props) {
  return (
    <>
      <nav aria-label="Portfolio sections" className="mb-6 hidden md:block">
        <ul className="flex gap-1 border-b border-[var(--rule)]">
          {HUB_TABS.map(tab => {
            const isActive = tab === active
            return (
              <li key={tab}>
                <Link
                  href={hubHref({ tab })}
                  aria-current={isActive ? 'page' : undefined}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-[var(--blue-700)] text-[var(--blue-700)]'
                      : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]'
                  }`}
                >
                  <TabIcon tab={tab} />
                  {HUB_TAB_LABELS[tab]}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <nav
        aria-label="Portfolio sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rule)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4">
          {HUB_TABS.map(tab => {
            const isActive = tab === active
            return (
              <li key={tab}>
                <Link
                  href={hubHref({ tab })}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                    isActive ? 'text-[var(--blue-700)]' : 'text-[var(--ink-3)]'
                  }`}
                >
                  <TabIcon tab={tab} />
                  {HUB_TAB_LABELS[tab]}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
