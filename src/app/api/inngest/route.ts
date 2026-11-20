import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { portfolioAnalysis } from '@/inngest/portfolioAnalysis'
import { executeTrades } from '@/inngest/executeTrades'
import { scheduledRunsCron, scheduledUserRun } from '@/inngest/scheduledRuns'
import { autopilotExecute } from '@/inngest/autopilotExecute'

export const { GET, POST, PUT } = serve({
  client:    inngest,
  functions: [portfolioAnalysis, executeTrades, scheduledRunsCron, scheduledUserRun, autopilotExecute],
})
