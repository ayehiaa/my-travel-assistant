import { NextRequest, NextResponse } from 'next/server'
import { handleApprovalDecision } from '@/lib/approvalDecisionRoute'

// POST — reject a pending autopilot recommendation (nothing is executed).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  return handleApprovalDecision(id, 'reject')
}
