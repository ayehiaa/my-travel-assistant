import { describe, expect, it } from 'vitest'
import {
  APPROVAL_WINDOW_MS,
  MANUAL_RUN_INFO,
  applyApprovalDecision,
  autopilotColumns,
  buildScheduledRunInfo,
  checkApprovalDecision,
  effectiveApprovalStatus,
  formatDuration,
  isAwaitingApproval,
  msUntilExpiry,
  readAutopilotInfo,
  shouldAutoExecute,
  type ApprovalContext,
  type AutopilotInfo,
} from './autopilot'

const completed = new Date('2026-11-23T15:45:00Z')
const pending = buildScheduledRunInfo('approval', completed)
const inWindow = new Date(completed.getTime() + 2 * 3600_000)
const afterWindow = new Date(completed.getTime() + APPROVAL_WINDOW_MS)

function ctx(over: Partial<ApprovalContext> = {}): ApprovalContext {
  return { info: pending, now: inWindow, isLatest: true, hasBlockingExecution: false, tradingPaused: false, ...over }
}

describe('buildScheduledRunInfo', () => {
  it('approval mode → pending for 24 h', () => {
    expect(pending.trigger).toBe('schedule')
    expect(pending.approval_status).toBe('pending')
    expect(pending.approval_expires_at).toBe('2026-11-24T15:45:00.000Z')
  })

  it('auto / off → no approval', () => {
    const auto = buildScheduledRunInfo('auto', completed)
    expect(auto.approval_status).toBeNull()
    expect(auto.approval_expires_at).toBeNull()
    expect(auto.mode).toBe('auto')
    expect(buildScheduledRunInfo('off', completed).approval_status).toBeNull()
  })
})

describe('readAutopilotInfo', () => {
  it('no data → manual run', () => {
    expect(readAutopilotInfo(null)).toEqual(MANUAL_RUN_INFO)
    expect(readAutopilotInfo({ agent_outputs: { macroeconomics: {} } })).toEqual(MANUAL_RUN_INFO)
  })

  it('reads agent_outputs.autopilot (pre-migration fallback)', () => {
    const info = readAutopilotInfo({ agent_outputs: { autopilot: pending } })
    expect(info).toEqual(pending)
  })

  it('columns win over agent_outputs when present', () => {
    const info = readAutopilotInfo({
      agent_outputs:       { autopilot: pending },
      approval_status:     'rejected',
      approval_decided_at: '2026-11-23T18:00:00Z',
    })
    expect(info.approval_status).toBe('rejected')
    expect(info.approval_decided_at).toBe('2026-11-23T18:00:00Z')
  })

  it('null columns (migration applied, not written) fall back to agent_outputs', () => {
    const info = readAutopilotInfo({ agent_outputs: { autopilot: pending }, approval_status: null, run_trigger: null })
    expect(info.approval_status).toBe('pending')
    expect(info.trigger).toBe('schedule')
  })

  it('run_trigger column alone marks a scheduled run', () => {
    expect(readAutopilotInfo({ run_trigger: 'schedule', agent_outputs: null }).trigger).toBe('schedule')
  })

  it('garbage values degrade safely', () => {
    const info = readAutopilotInfo({ agent_outputs: { autopilot: { trigger: 'robot', mode: 'yolo', approval_status: 'maybe' } } })
    expect(info.trigger).toBe('manual')
    expect(info.mode).toBe('off')
    expect(info.approval_status).toBeNull()
  })
})

describe('expiry', () => {
  it('pending inside the window, expired at / after it', () => {
    expect(effectiveApprovalStatus(pending, inWindow)).toBe('pending')
    expect(effectiveApprovalStatus(pending, afterWindow)).toBe('expired')
    expect(effectiveApprovalStatus(pending, new Date(afterWindow.getTime() + 1))).toBe('expired')
  })

  it('pending without an expiry is treated as expired (fail closed)', () => {
    expect(effectiveApprovalStatus({ ...pending, approval_expires_at: null }, inWindow)).toBe('expired')
  })

  it('decided statuses never change', () => {
    expect(effectiveApprovalStatus({ ...pending, approval_status: 'approved' }, afterWindow)).toBe('approved')
    expect(effectiveApprovalStatus({ ...pending, approval_status: 'rejected' }, afterWindow)).toBe('rejected')
  })

  it('msUntilExpiry', () => {
    expect(msUntilExpiry(pending, inWindow)).toBe(22 * 3600_000)
    expect(msUntilExpiry(pending, afterWindow)).toBe(0)
    expect(msUntilExpiry(MANUAL_RUN_INFO, inWindow)).toBe(0)
  })

  it('formatDuration', () => {
    expect(formatDuration(22 * 3600_000 + 5 * 60_000)).toBe('22h 5m')
    expect(formatDuration(45 * 60_000)).toBe('45m')
    expect(formatDuration(10_000)).toBe('under 1m')
  })
})

describe('checkApprovalDecision', () => {
  it('approve a pending, latest, unexecuted recommendation', () => {
    expect(checkApprovalDecision('approve', ctx())).toEqual({ ok: true, next: 'approved' })
  })

  it('reject a pending recommendation (even if not latest or paused)', () => {
    expect(checkApprovalDecision('reject', ctx({ isLatest: false, tradingPaused: true }))).toEqual({ ok: true, next: 'rejected' })
  })

  it('manual runs cannot be approved', () => {
    const r = checkApprovalDecision('approve', ctx({ info: MANUAL_RUN_INFO }))
    expect(r).toMatchObject({ ok: false, reason: 'not_scheduled', httpStatus: 409 })
  })

  it('auto-mode scheduled runs have nothing to approve', () => {
    const r = checkApprovalDecision('approve', ctx({ info: buildScheduledRunInfo('auto', completed) }))
    expect(r).toMatchObject({ ok: false, reason: 'not_scheduled' })
  })

  it('expired → refused for both decisions', () => {
    expect(checkApprovalDecision('approve', ctx({ now: afterWindow }))).toMatchObject({ ok: false, reason: 'expired' })
    expect(checkApprovalDecision('reject', ctx({ now: afterWindow }))).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('already decided → refused', () => {
    const approved = applyApprovalDecision(pending, 'approved', inWindow, 'exec-1')
    expect(checkApprovalDecision('approve', ctx({ info: approved }))).toMatchObject({ ok: false, reason: 'not_pending' })
    const rejected = applyApprovalDecision(pending, 'rejected', inWindow, null)
    expect(checkApprovalDecision('approve', ctx({ info: rejected }))).toMatchObject({ ok: false, reason: 'not_pending' })
    expect(checkApprovalDecision('reject', ctx({ info: rejected }))).toMatchObject({ ok: false, reason: 'not_pending' })
  })

  it('approve refused when not latest, already executed or paused', () => {
    expect(checkApprovalDecision('approve', ctx({ isLatest: false }))).toMatchObject({ ok: false, reason: 'not_latest', httpStatus: 409 })
    expect(checkApprovalDecision('approve', ctx({ hasBlockingExecution: true }))).toMatchObject({ ok: false, reason: 'already_executed', httpStatus: 409 })
    expect(checkApprovalDecision('approve', ctx({ tradingPaused: true }))).toMatchObject({ ok: false, reason: 'trading_paused', httpStatus: 423 })
  })
})

describe('applyApprovalDecision', () => {
  it('records status, time and execution id', () => {
    const next = applyApprovalDecision(pending, 'approved', inWindow, 'exec-1')
    expect(next.approval_status).toBe('approved')
    expect(next.approval_decided_at).toBe(inWindow.toISOString())
    expect(next.execution_id).toBe('exec-1')
    expect(next.approval_expires_at).toBe(pending.approval_expires_at)
  })
})

describe('shouldAutoExecute', () => {
  const autoInfo: AutopilotInfo = buildScheduledRunInfo('auto', completed)

  it('only scheduled runs completed in auto mode while the mode is still auto', () => {
    expect(shouldAutoExecute(autoInfo, 'auto')).toBe(true)
    expect(shouldAutoExecute(autoInfo, 'approval')).toBe(false)
    expect(shouldAutoExecute(autoInfo, 'off')).toBe(false)
    expect(shouldAutoExecute(pending, 'auto')).toBe(false)
    expect(shouldAutoExecute(MANUAL_RUN_INFO, 'auto')).toBe(false)
    expect(shouldAutoExecute({ ...autoInfo, trigger: 'manual' }, 'auto')).toBe(false)
  })
})

describe('isAwaitingApproval', () => {
  it('pending, in window, not executed', () => {
    expect(isAwaitingApproval(pending, inWindow, false)).toBe(true)
    expect(isAwaitingApproval(pending, inWindow, true)).toBe(false)
    expect(isAwaitingApproval(pending, afterWindow, false)).toBe(false)
    expect(isAwaitingApproval(MANUAL_RUN_INFO, inWindow, false)).toBe(false)
  })
})

describe('autopilotColumns', () => {
  it('maps info to the migration columns', () => {
    expect(autopilotColumns(pending)).toEqual({
      run_trigger:         'schedule',
      approval_status:     'pending',
      approval_expires_at: '2026-11-24T15:45:00.000Z',
      approval_decided_at: null,
    })
  })
})
