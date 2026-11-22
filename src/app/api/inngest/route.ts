import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { portfolioAnalysis } from '@/inngest/portfolioAnalysis'
import { executeTrades } from '@/inngest/executeTrades'
import { scheduledRunsCron, scheduledUserRun } from '@/inngest/scheduledRuns'
import { autopilotExecute } from '@/inngest/autopilotExecute'
import {
  approvalExpiryWatch,
  deliverNotification,
  notifyExecutionCompleted,
  notifyRunCompleted,
  weeklySummaryCron,
  weeklySummaryUser,
} from '@/inngest/notifications'
import { healthRemindersCron, healthRemindersUser } from '@/inngest/healthReminders'
import { healthPhotoCleanup } from '@/inngest/healthPhotoCleanup'

export const { GET, POST, PUT } = serve({
  client:    inngest,
  functions: [
    portfolioAnalysis,
    executeTrades,
    scheduledRunsCron,
    scheduledUserRun,
    autopilotExecute,
    deliverNotification,
    notifyRunCompleted,
    approvalExpiryWatch,
    notifyExecutionCompleted,
    weeklySummaryCron,
    weeklySummaryUser,
    healthRemindersCron,
    healthRemindersUser,
    healthPhotoCleanup,
  ],
})
