import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { portfolioAnalysis } from '@/inngest/portfolioAnalysis'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [portfolioAnalysis],
  serveHost: process.env.NEXT_PUBLIC_APP_URL,
})
