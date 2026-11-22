import { describe, it, expect } from 'vitest'
import { AI_MODELS, AI_ROLE_CONFIG, getRoleConfig } from './aiModels'
import { MODEL_PRICES } from './aiCost'

describe('aiModels', () => {
  it('runs every portfolio-analysis role on Sonnet 5.5 with the agreed budgets', () => {
    expect(getRoleConfig('agent')).toEqual({ model: 'claude-sonnet-5-5', maxTokens: 8000, effort: 'medium' })
    expect(getRoleConfig('synthesizer')).toEqual({ model: 'claude-sonnet-5-5', maxTokens: 16000, effort: 'high' })
    expect(getRoleConfig('shariah_reviewer')).toEqual({ model: 'claude-sonnet-5-5', maxTokens: 16000, effort: 'high' })
    expect(getRoleConfig('health_food')).toEqual({ model: 'claude-sonnet-5-5', maxTokens: 6000, effort: 'low' })
  })

  it('has a price for every configured model', () => {
    for (const cfg of Object.values(AI_ROLE_CONFIG)) expect(MODEL_PRICES[cfg.model]).toBeDefined()
    for (const id of Object.values(AI_MODELS)) expect(MODEL_PRICES[id]).toBeDefined()
  })
})
