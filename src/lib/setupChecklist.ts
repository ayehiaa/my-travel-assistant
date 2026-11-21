import { hubHref } from '@/lib/portfolioHub'

/** "Getting started" checklist on the Portfolio Overview (specs/026-friend-onboarding-byo-ai-key). Pure. */

export type AiKeyState = 'own' | 'app_owner' | 'none'

export interface ChecklistItem {
  key: 'terms' | 'alpaca' | 'ai_key' | 'first_run'
  label: string
  detail: string
  done: boolean
  href: string
  cta: string
}

export function buildSetupChecklist(state: {
  tosAccepted: boolean
  alpacaConnected: boolean
  aiKey: AiKeyState
  hasCompletedRun: boolean
}): { items: ChecklistItem[]; complete: boolean; doneCount: number } {
  const settings = hubHref({ tab: 'settings' })
  const items: ChecklistItem[] = [
    {
      key: 'terms', label: 'Accept terms', done: state.tosAccepted, href: hubHref({}), cta: 'Review terms',
      detail: 'The Portfolio terms and risk notice.',
    },
    {
      key: 'alpaca', label: 'Connect Alpaca (paper)', done: state.alpacaConnected, href: `${settings}#alpaca`, cta: 'Open Settings',
      detail: 'Create a free paper-trading account and paste its API keys.',
    },
    {
      key: 'ai_key', label: 'Add your Anthropic API key', done: state.aiKey !== 'none', href: `${settings}#ai-key`, cta: 'Open Settings',
      detail: state.aiKey === 'app_owner'
        ? 'Using the app key (owner account).'
        : 'You pay Anthropic directly for your analyses (≈ $0.15–0.30 each).',
    },
    {
      key: 'first_run', label: 'Run your first analysis (dry run)', done: state.hasCompletedRun,
      href: hubHref({ tab: 'rebalance' }), cta: 'Go to Rebalance',
      detail: 'Dry run is on by default — nothing is sent to Alpaca until you turn it off.',
    },
  ]
  const doneCount = items.filter(i => i.done).length
  return { items, complete: doneCount === items.length, doneCount }
}
