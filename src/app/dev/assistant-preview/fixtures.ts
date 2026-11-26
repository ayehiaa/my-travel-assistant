import type { UiMessage } from '@/lib/assistant/history'
import type { LiveAnswer } from '@/components/assistant/useAssistantChat'
import type { ConversationSummary } from '@/components/assistant/useAssistantChat'

/** Fixture data for the dev-only My Assistant preview (specs/033). Not real user data. */

const t = (h: number, m: number) => `2026-11-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`

export const CONVERSATIONS: ConversationSummary[] = [
  { id: 'c1', title: 'What did I spend last month by category?', totalCostUsd: 0.06, updatedAt: '2026-11-26T09:14:00Z' },
  { id: 'c2', title: 'Am I on track for protein today?', totalCostUsd: 0.03, updatedAt: '2026-11-25T07:40:00Z' },
  { id: 'c3', title: 'Why did the last recommendation sell anything?', totalCostUsd: 0.09, updatedAt: '2026-11-22T18:05:00Z' },
  { id: 'c4', title: 'When is my next trip?', totalCostUsd: 0.02, updatedAt: '2026-11-14T10:30:00Z' },
]

export const MESSAGES: UiMessage[] = [
  { id: 'u1', role: 'user', text: 'What did I spend last month by category?', createdAt: t(9, 12) },
  {
    id: 'a1', role: 'assistant', createdAt: t(9, 12), refused: false, notice: null, costUsd: 0.031,
    tools: ['get_context', 'expense_summary'],
    text: [
      'In **October 2026** you spent **£1,284.40** and **$212.00** across 14 expenses (1 – 31 Oct 2026).',
      '',
      '| Category | GBP | USD | Pending |',
      '|:--|--:|--:|--:|',
      '| Hotel | £742.00 | — | £0.00 |',
      '| Flights | £356.20 | — | £356.20 |',
      '| Food & drink | £118.70 | $64.00 | £18.70 |',
      '| Transport | £67.50 | $148.00 | $148.00 |',
      '',
      '- **£374.90** and **$148.00** have not been reclaimed yet.',
      '- Amounts are shown per currency; nothing was converted.',
    ].join('\n'),
    followUps: ['Which of these are not reclaimed?', 'Compare with September'],
  },
  { id: 'u2', role: 'user', text: 'How many days have I been outside the UK in the last 12 months?', createdAt: t(9, 14) },
]

export const LIVE: LiveAnswer = {
  tools: [
    { tool: 'get_context', label: 'Checking the date…' },
    { tool: 'days_outside_uk', label: 'Counting days outside the UK…' },
  ],
  text: "You've been outside the UK for **41 days** in the 12 months to 26 Nov 2026 — **49 days** left of the 90-day allowance.\n\n| Trip | Dates | Days |\n|:--|:--|--:|\n| LHR → DXB → LHR | 1 – 11 Mar 2026 | 9 |\n| LHR → JFK → LHR | 2 – 16 Jul",
}

export const LIVE_TOOLS_ONLY: LiveAnswer = {
  tools: [{ tool: 'health_today', label: "Reading today's targets…" }],
  text: '',
}
