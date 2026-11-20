import { NextRequest, NextResponse } from 'next/server'
import { handleApprovalDecision } from '@/lib/approvalDecisionRoute'

// POST — approve a pending autopilot recommendation and request its execution (dry run / live per settings).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleApprovalDecision(id, 'approve')
}
