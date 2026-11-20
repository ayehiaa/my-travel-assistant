import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { portfolioAnalysis } from '@/inngest/portfolioAnalysis'
import { executeTrades } from '@/inngest/executeTrades'

export const { GET, POST, PUT } = serve({ client: inngest, functions: [portfolioAnalysis, executeTrades] })
