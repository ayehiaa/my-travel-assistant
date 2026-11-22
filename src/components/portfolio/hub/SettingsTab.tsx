import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getAiKey, getSettingsRow, getSetupChecklist } from '@/lib/portfolioHubData'
import type { PortfolioSettings } from '@/types/database'
import PortfolioSettingsForm from '../PortfolioSettingsForm'
import AlpacaCredentialsForm from '../AlpacaCredentialsForm'
import RiskSafetyCard from '../RiskSafetyCard'
import AutopilotCard from '../AutopilotCard'
import NotificationsCard from '../NotificationsCard'
import AiKeyCard from '../AiKeyCard'
import GettingStartedChecklist from './GettingStartedChecklist'
import ScreeningSettingsCard from '../ScreeningSettingsCard'
import { readScreeningSettings } from '@/lib/screeningConfig'
import { readSafetySettings } from '@/lib/riskLimits'
import { readAutopilotSettings } from '@/lib/schedule'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import { readEmailConfig } from '@/lib/notifications/config'
import {
  SETTINGS_SECTIONS,
  SETTINGS_SECTION_DESCRIPTIONS,
  SETTINGS_SECTION_LABELS,
  settingsHref,
  type SettingsSection,
} from '@/lib/portfolioHub'

interface Props {
  userId: string
  email: string
  section: SettingsSection
}

/** Section navigation: horizontal scrolling chips on mobile, a sticky vertical list on desktop. */
function SectionNav({ active }: { active: SettingsSection }) {
  return (
    <nav aria-label="Settings sections" className="-mx-4 min-w-0 overflow-x-auto px-4 md:sticky md:top-24 md:mx-0 md:self-start md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col md:gap-1">
        {SETTINGS_SECTIONS.map(s => {
          const isActive = s === active
          return (
            <li key={s} className="shrink-0">
              <Link
                href={settingsHref(s)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-block whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold md:block md:rounded-lg md:border-transparent md:px-3 md:py-2 md:text-sm ${
                  isActive
                    ? 'border-[var(--blue-700)] bg-[var(--blue-700)] text-white md:bg-[var(--blue-50)] md:text-[var(--blue-700)]'
                    : 'border-[var(--rule)] bg-white text-[var(--ink-2)] hover:border-[var(--ink-4)] md:bg-transparent md:hover:bg-[var(--paper-2)]'
                }`}
              >
                {SETTINGS_SECTION_LABELS[s]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

async function SetupSection({ userId, email }: { userId: string; email: string }) {
  const supabase = await createClient()
  const [checklist, credRes, aiKey] = await Promise.all([
    getSetupChecklist(userId, email),
    supabase.from('alpaca_credentials').select('is_paper').eq('user_id', userId).maybeSingle(),
    getAiKey(userId, email),
  ])
  const alpacaCred = credRes.data
  return (
    <>
      {checklist.complete ? (
        <p className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
          All set ✓
        </p>
      ) : (
        <GettingStartedChecklist items={checklist.items} doneCount={checklist.doneCount} />
      )}
      <div id="alpaca" className="scroll-mt-24">
        <AlpacaCredentialsForm initialConnected={!!alpacaCred} initialIsPaper={alpacaCred?.is_paper ?? true} />
      </div>
      <div id="ai-key" className="scroll-mt-24">
        <AiKeyCard
          migrationApplied={aiKey.migrationApplied}
          initialConnected={aiKey.connected}
          initialProvider={aiKey.provider}
          initialLast4={aiKey.last4}
          initialCreatedAt={aiKey.createdAt}
          usingOwnerFallback={aiKey.usingOwnerFallback}
        />
      </div>
    </>
  )
}

function StrategySection({ userId, settingsRow }: { userId: string; settingsRow: Record<string, unknown> | null }) {
  const defaultSettings: PortfolioSettings = {
    user_id: userId,
    cash_usd: 0,
    target_return_pct: 10,
    target_horizon: 'annual',
    risk_profile: 'moderate',
    run_interval_days: 30,
    last_run_at: null,
    next_run_at: null,
    last_synced_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const screening = readScreeningSettings(settingsRow)
  return (
    <>
      <PortfolioSettingsForm initialSettings={(settingsRow as unknown as PortfolioSettings | null) ?? defaultSettings} />
      <ScreeningSettingsCard
        initial={{
          islamic_enabled:  screening.islamic_enabled,
          business_screen:  screening.business_screen,
          financial_screen: screening.financial_screen,
          stocks_only:      screening.stocks_only,
        }}
        migrationApplied={screening.migration_applied}
      />
    </>
  )
}

/**
 * Settings tab (specs/028): sub-navigation + only the active section, rendered on the server.
 * ?section=setup|strategy|automation|safety|notifications (default setup). Card components and their APIs are unchanged.
 */
export default async function SettingsTab({ userId, email, section }: Props) {
  // The hub page upserts the settings row before rendering, so it normally exists here
  const settingsRow = await getSettingsRow(userId)
  const safety = readSafetySettings(settingsRow)

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8">
      <SectionNav active={section} />
      <div className="min-w-0 max-w-2xl space-y-4">
        <div>
          <h3 className="font-[family-name:var(--display)] text-lg font-bold text-[var(--ink)]">
            {SETTINGS_SECTION_LABELS[section]}
          </h3>
          <p className="mt-0.5 text-sm text-[var(--ink-3)]">{SETTINGS_SECTION_DESCRIPTIONS[section]}</p>
        </div>

        {section === 'setup' && <SetupSection userId={userId} email={email} />}
        {section === 'strategy' && <StrategySection userId={userId} settingsRow={settingsRow} />}
        {section === 'automation' && (
          <AutopilotCard
            initial={readAutopilotSettings(settingsRow)}
            dryRun={safety.dry_run}
            tradingPaused={safety.trading_paused}
          />
        )}
        {section === 'safety' && <RiskSafetyCard initial={safety} />}
        {section === 'notifications' && (
          <NotificationsCard
            initial={readNotificationPrefs(settingsRow)}
            emailConfigured={readEmailConfig(process.env).ok}
            migrationApplied={settingsRow !== null && 'notification_prefs' in settingsRow}
            email={email}
          />
        )}
      </div>
    </div>
  )
}
