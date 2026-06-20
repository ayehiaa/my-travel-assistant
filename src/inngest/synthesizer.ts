import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { AgentOutput, PortfolioSnapshot, PortfolioSettings, TargetAllocationItem } from '@/types/database'

export interface SynthesizerParams {
  agentOutputs: Record<string, AgentOutput>
  snapshot: PortfolioSnapshot
  settings: PortfolioSettings
  recentSummaries: string[]
}

export interface SynthesizerOutput {
  target_allocation: TargetAllocationItem[]
  summary_text: string
  conflict_notes: string
}

const SynthesisSchema = z.object({
  target_allocation: z
    .array(
      z.object({
        ticker:     z.string(),
        target_pct: z.number(),
        rationale:  z.string(),
      })
    )
    .refine(
      items => {
        const sum = items.reduce((s, i) => s + i.target_pct, 0)
        return sum >= 99.5 && sum <= 100.5
      },
      { message: 'Allocation must sum to 100%' }
    ),
  summary_text:   z.string(),
  conflict_notes: z.string(),
})

function buildSystemPrompt(settings: PortfolioSettings, snapshot: PortfolioSnapshot): string {
  const holdingsText = snapshot.holdings
    .map(h => `  ${h.ticker} (${h.company_name}): $${h.total_value_usd.toFixed(2)}`)
    .join('\n')

  return (
    'You are a senior portfolio strategist synthesizing analysis from multiple specialised agents ' +
    'into a unified investment recommendation. ' +
    'Return ONLY a raw JSON object (no markdown, no code fences) with exactly three fields: ' +
    '"target_allocation" (array of { ticker, target_pct, rationale }), ' +
    '"summary_text" (100–200 word overall assessment string), ' +
    '"conflict_notes" (1–2 sentence summary of key agent disagreements, or empty string if none).\n\n' +
    `Risk profile: ${settings.risk_profile}\n` +
    `Target return: ${settings.target_return_pct}%\n\n` +
    'Current portfolio holdings:\n' +
    holdingsText + '\n' +
    `Cash: $${snapshot.cash_usd.toFixed(2)}\n` +
    `Total portfolio value: $${snapshot.total_value_usd.toFixed(2)}\n\n` +
    'You may recommend new stocks or ETFs not currently in the portfolio if they would help achieve ' +
    `the target return of ${settings.target_return_pct}% and suit the stated risk profile. ` +
    'IMPORTANT ticker rules — all tickers in target_allocation must follow these rules:\n' +
    '  1. Use only real, valid US-traded ticker symbols (e.g. "XLF", "QQQ", "MSFT", "VOO").\n' +
    '  2. Never invent tickers or use sector labels as tickers (e.g. "Financials_ETF" is invalid; "XLF" is correct).\n' +
    '  3. Limit new additions to a maximum of 3 new instruments per recommendation.\n' +
    '  4. All recommended tickers will be validated against market data — invalid tickers will be stripped and your rationale will be lost.\n\n' +
    'Output format — return a JSON object with exactly these three keys:\n' +
    '  target_allocation: array of { ticker: string, target_pct: number, rationale: string } ' +
    '(percentages must sum to 100%; rationale max 20 words per ticker)\n' +
    '  summary_text: string (100–200 word overall assessment)\n' +
    '  conflict_notes: string (1–2 sentences on agent disagreements, or "" if none)'
  )
}

function buildUserPrompt(
  agentOutputs: Record<string, AgentOutput>,
  recentSummaries: string[]
): string {
  const parts: string[] = []

  if (recentSummaries.length > 0) {
    for (const summary of recentSummaries) {
      parts.push(`[PAST CONTEXT]\n${summary}\n`)
    }
  }

  for (const [agentKey, output] of Object.entries(agentOutputs)) {
    parts.push(
      `[AGENT: ${agentKey}]\n` +
      `Stance: ${output.stance} | Confidence: ${output.confidence}\n` +
      `Analysis: ${output.analysis}`
    )
  }

  return parts.join('\n\n')
}

export async function runSynthesizer(params: SynthesizerParams): Promise<SynthesizerOutput> {
  const { agentOutputs, snapshot, settings, recentSummaries } = params

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 3000,
    system:     buildSystemPrompt(settings, snapshot),
    messages:   [{ role: 'user', content: buildUserPrompt(agentOutputs, recentSummaries) }],
  })

  const block = response.content[0]
  const raw = block.type === 'text' ? block.text : ''
  // Extract the JSON object regardless of surrounding prose or code fences
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Synthesizer returned no JSON object')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Synthesizer returned malformed JSON')
  }

  const validationResult = SynthesisSchema.safeParse(parsed)
  if (!validationResult.success) {
    const messages = validationResult.error.issues.map(i => i.message).join('; ')
    throw new Error(`Synthesizer output failed schema validation: ${messages}`)
  }
  const validated = validationResult.data

  return {
    target_allocation: validated.target_allocation,
    summary_text:      validated.summary_text,
    conflict_notes:    validated.conflict_notes,
  }
}
