import { createClient } from '@/lib/supabase/server'
import { getSettingsRow } from '@/lib/portfolioHubData'
import type { PortfolioSettings } from '@/types/database'
import PortfolioSettingsForm from '../PortfolioSettingsForm'
import AlpacaCredentialsForm from '../AlpacaCredentialsForm'
import RiskSafetyCard from '../RiskSafetyCard'
import AutopilotCard from '../AutopilotCard'
import NotificationsCard from '../NotificationsCard'
import { readSafetySettings } from '@/lib/riskLimits'
import { readAutopilotSettings } from '@/lib/schedule'
import { readNotificationPrefs } from '@/lib/notifications/prefs'
import { readEmailConfig } from '@/lib/notifications/config'

/** Settings tab: the portfolio settings cards (moved unchanged from the old /portfolio/settings page). */
export default async function SettingsTab({ userId, email }: { userId: string; email: string }) {
  const supabase = await createClient()
  // The hub page upserts the settings row before rendering, so it normally exists here
  const [settingsRow, credRes] = await Promise.all([
    getSettingsRow(userId),
    supabase.from('alpaca_credentials').select('is_paper').eq('user_id', userId).maybeSingle(),
  ])
  const alpacaCred = credRes.data

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

  const safety = readSafetySettings(settingsRow)

  return (
    <div className="flex flex-col gap-6 [&>*]:mt-0!">
      <PortfolioSettingsForm initialSettings={(settingsRow as unknown as PortfolioSettings | null) ?? defaultSettings} />
      <AutopilotCard
        initial={readAutopilotSettings(settingsRow)}
        dryRun={safety.dry_run}
        tradingPaused={safety.trading_paused}
      />
      <RiskSafetyCard initial={safety} />
      <NotificationsCard
        initial={readNotificationPrefs(settingsRow)}
        emailConfigured={readEmailConfig(process.env).ok}
        migrationApplied={settingsRow !== null && 'notification_prefs' in settingsRow}
        email={email}
      />
      <div className="max-w-[480px] rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-gray-900">Islamic screening</span>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Always on</span>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Every analysis and every buy is limited to Shariah-compliant individual common stocks (max 20% each).
          No ETFs, funds, bonds, preferred shares, options, shorting or margin. Holdings that fail screening are
          recommended for sale.
        </p>
      </div>
      <section>
        <h3 className="mb-1 text-lg font-bold text-[var(--ink)]" style={{ fontFamily: 'var(--display)' }}>
          Alpaca connection
        </h3>
        <p className="mb-4 text-sm text-[var(--ink-3)]">Connect your Alpaca account to execute trades from recommendations.</p>
        <AlpacaCredentialsForm initialConnected={!!alpacaCred} initialIsPaper={alpacaCred?.is_paper ?? true} />
      </section>
    </div>
  )
}
