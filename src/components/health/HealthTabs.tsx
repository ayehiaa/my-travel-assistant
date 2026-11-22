import Link from 'next/link'
import { HEALTH_TABS, HEALTH_TAB_LABELS, healthHref, type HealthTab } from '@/lib/health/healthHub'

const ICON_PATHS: Record<HealthTab, string> = {
  today:     'M12 3v2M12 19v2M5 12H3M21 12h-2M7 7l-1.5-1.5M18.5 18.5L17 17M7 17l-1.5 1.5M18.5 5.5L17 7M12 8a4 4 0 100 8 4 4 0 000-8z',
  log:       'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  training:  'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  progress:  'M3 17l6-6 4 4 8-8M14 7h7v7',
  programme: 'M6 4h9l3 3v13H6zM9 10h6M9 14h6',
}

function TabIcon({ tab }: { tab: HealthTab }) {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[tab]} />
    </svg>
  )
}

/** Health hub navigation: top tabs on desktop, fixed bottom bar on small screens (same pattern as the Portfolio hub). */
export default function HealthTabs({ active }: { active: HealthTab }) {
  return (
    <>
      <nav aria-label="Health sections" className="mb-6 hidden md:block">
        <ul className="flex gap-1 border-b border-[var(--rule)]">
          {HEALTH_TABS.map(tab => (
            <li key={tab}>
              <Link
                href={healthHref({ tab })}
                aria-current={tab === active ? 'page' : undefined}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tab === active ? 'border-[var(--blue-700)] text-[var(--blue-700)]' : 'border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]'
                }`}
              >
                <TabIcon tab={tab} />
                {HEALTH_TAB_LABELS[tab]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav
        aria-label="Health sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--rule)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {HEALTH_TABS.map(tab => (
            <li key={tab}>
              <Link
                href={healthHref({ tab })}
                aria-current={tab === active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${tab === active ? 'text-[var(--blue-700)]' : 'text-[var(--ink-3)]'}`}
              >
                <TabIcon tab={tab} />
                {HEALTH_TAB_LABELS[tab]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
