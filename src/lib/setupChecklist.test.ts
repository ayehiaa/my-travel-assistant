import { describe, it, expect } from 'vitest'
import { buildSetupChecklist } from './setupChecklist'

describe('buildSetupChecklist', () => {
  it('lists the four steps in order with links to the right tabs', () => {
    const { items, complete, doneCount } = buildSetupChecklist({ tosAccepted: true, alpacaConnected: false, aiKey: 'none', hasCompletedRun: false })
    expect(items.map(i => i.key)).toEqual(['terms', 'alpaca', 'ai_key', 'first_run'])
    expect(items.map(i => i.done)).toEqual([true, false, false, false])
    expect(items[1].href).toBe('/portfolio?tab=settings&section=setup#alpaca')
    expect(items[2].href).toBe('/portfolio?tab=settings&section=setup#ai-key')
    expect(items[3].href).toBe('/portfolio?tab=rebalance')
    expect(complete).toBe(false)
    expect(doneCount).toBe(1)
  })
  it('counts the owner app-key fallback as done', () => {
    const { items } = buildSetupChecklist({ tosAccepted: true, alpacaConnected: true, aiKey: 'app_owner', hasCompletedRun: false })
    expect(items[2].done).toBe(true)
    expect(items[2].detail).toMatch(/app key/)
  })
  it('is complete when every step is done', () => {
    const r = buildSetupChecklist({ tosAccepted: true, alpacaConnected: true, aiKey: 'own', hasCompletedRun: true })
    expect(r.complete).toBe(true)
    expect(r.doneCount).toBe(4)
  })
})
