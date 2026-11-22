import { z } from 'zod'
import { NonRetriableError } from 'inngest'
import { inngest } from '@/inngest/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAlpacaCredentials } from '@/lib/alpacaLivePortfolio'
import {
  cancelOrder,
  fetchBuyingInputs,
  fetchClock,
  fetchOrder,
  fetchOrderByClientId,
  submitOrder,
} from '@/lib/alpacaClient'
import { getBuyBlockReason, readShariahScreening } from '@/lib/shariahRules'
import { bufferedBuyingCapacity } from '@/lib/riskLimits'
import { checkLossStops, loadSafetySettings, loadScreeningConfig, setTradingPause } from '@/lib/tradingSafety'
import {
  ORDER_POLL_INTERVAL,
  ORDER_POLL_INTERVAL_MS,
  ORDER_POLL_TIMEOUT_MS,
  applyOrderSnapshot,
  buildEnvelope,
  buildRiskCheckedPlan,
  computeBuyingCapacity,
  decideMarketWait,
  deriveExecutionStatus,
  haltOrders,
  isOrderOpen,
  isTerminalExecutionStatus,
  markSimulated,
  parseStoredOrders,
  scaleBuysToCapacity,
  type MarketWaitDecision,
  type TradingCredentials,
} from '@/lib/tradeExecution'
import { EXECUTION_COMPLETED_EVENT, EXECUTION_REQUESTED_EVENT } from '@/lib/tradeExecutionRequest'
import { notificationEvent } from '@/lib/notifications/emit'
import type { ActionItem, AlpacaOrderResult, ExecutionEnvelope, ExecutionStatus } from '@/types/database'

/**
 * Order execution engine. Triggered by portfolio/execution.requested { execution_id, user_id, recommendation_id }.
 *
 * load (+ safety settings) → check market (sleep until open; skipped in dry run) → plan (risk limits)
 * → [dry run: record orders as simulated → dry_run_completed]
 * → safety check (pause, cancelled row, loss stops) → submit SELLs (halt check per order) → poll (≤30m, cancel stale)
 * → safety check → size BUYs to settled cash minus the cash buffer → submit BUYs (halt + Shariah re-check)
 * → poll (≤30m, cancel stale) → finish.
 *
 * A halt (kill switch, cancelled row, loss stop) cancels this execution's open orders, skips everything not yet
 * submitted and ends the run as "cancelled"; a breached loss stop also engages the trading pause.
 *
 * Safety:
 * - every order carries a deterministic client_order_id and is looked up before submission (retry-safe)
 * - credentials are loaded inside each step and never returned from a step (never persisted in step state)
 * - the alpaca_executions row is re-validated against the event's user_id and recommendation_id
 * See specs/020-order-execution-engine/spec.md.
 */

const EventDataSchema = z.object({
  execution_id:      z.string().uuid(),
  user_id:           z.string().uuid(),
  recommendation_id: z.string().uuid(),
})

const MAX_MARKET_CHECKS = 12
const MAX_POLLS = Math.ceil(ORDER_POLL_TIMEOUT_MS / ORDER_POLL_INTERVAL_MS)

async function loadCreds(userId: string): Promise<TradingCredentials> {
  const creds = await loadAlpacaCredentials(userId)
  if (!creds) throw new NonRetriableError('Alpaca account is no longer connected')
  return creds
}

/**
 * Save the envelope. Conditional: never overwrites a row the kill switch already marked "cancelled"
 * (only a "cancelled" write may touch such a row), so a paused execution cannot be revived by a late write.
 */
async function persist(executionId: string, userId: string, envelope: ExecutionEnvelope): Promise<void> {
  const admin = createAdminClient()
  let query = admin
    .from('alpaca_executions')
    .update({ orders: envelope })
    .eq('id', executionId)
    .eq('user_id', userId)
  if (envelope.status !== 'cancelled') query = query.neq('orders->>status', 'cancelled')
  const { error } = await query
  if (error) throw new Error('Failed to save execution state')
}

/** Why this execution must stop now (row cancelled by the kill switch, or trading paused), or null. */
async function readHaltReason(executionId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const [{ data: row }, safety] = await Promise.all([
    admin.from('alpaca_executions').select('orders').eq('id', executionId).eq('user_id', userId).maybeSingle(),
    loadSafetySettings(userId),
  ])
  if (row && parseStoredOrders(row.orders).status === 'cancelled') return 'the execution was cancelled'
  if (safety.trading_paused) return `trading is paused${safety.paused_reason ? ` (${safety.paused_reason})` : ''}`
  return null
}

interface SafetyDecision {
  halt: string | null
  engagePause: boolean
}

/** Kill switch + loss stops. A breached stop asks the caller to engage the pause; a data outage only halts. */
async function runSafetyCheck(executionId: string, userId: string): Promise<SafetyDecision> {
  const halt = await readHaltReason(executionId, userId)
  if (halt) return { halt, engagePause: false }
  const safety = await loadSafetySettings(userId)
  const creds = await loadCreds(userId)
  const loss = await checkLossStops(creds, safety.limits)
  if (loss.blocked) return { halt: loss.reason ?? 'a loss stop is active', engagePause: loss.triggered !== null }
  return { halt: null, engagePause: false }
}

function replaceOrder(orders: AlpacaOrderResult[], updated: AlpacaOrderResult): AlpacaOrderResult[] {
  return orders.map(o => (o.client_order_id === updated.client_order_id && o.action === updated.action ? updated : o))
}

function isDuplicateClientIdRejection(message: string | null): boolean {
  return !!message && /client_order_id/i.test(message)
}

/**
 * Submit one planned order idempotently: look it up by client_order_id first, submit only if absent.
 * Never throws for broker rejections (they are recorded on the order); throws only when the lookup itself
 * fails, so the step retries and the lookup runs again.
 */
async function submitIdempotent(creds: TradingCredentials, order: AlpacaOrderResult): Promise<AlpacaOrderResult> {
  const nowIso = () => new Date().toISOString()
  const cid = order.client_order_id
  if (!cid) return { ...order, status: 'error', error_message: 'Missing client order id', updated_at: nowIso() }

  const existing = await fetchOrderByClientId(cid, creds.keyId, creds.secret, creds.isPaper)
  if (existing) return applyOrderSnapshot(order, existing, nowIso())

  const useNotional = order.action === 'buy' && typeof order.notional === 'number' && order.notional > 0
  const result = await submitOrder(
    {
      symbol:          order.ticker,
      side:            order.action,
      client_order_id: cid,
      ...(useNotional ? { notional: order.notional as number } : { qty: order.qty }),
    },
    creds.keyId,
    creds.secret,
    creds.isPaper,
  )

  if (result.status === 'submitted' && result.order) {
    return applyOrderSnapshot({ ...order, submitted_at: nowIso() }, result.order, nowIso())
  }

  // A duplicate-id rejection or a network error may hide an order that did reach the broker — look once more.
  if (result.status === 'error' || isDuplicateClientIdRejection(result.error_message)) {
    try {
      const again = await fetchOrderByClientId(cid, creds.keyId, creds.secret, creds.isPaper)
      if (again) return applyOrderSnapshot(order, again, nowIso())
    } catch {
      // fall through and record the original failure
    }
  }

  return {
    ...order,
    status:        result.status === 'rejected' ? 'rejected' : 'error',
    error_message: result.error_message,
    updated_at:    nowIso(),
  }
}

export const executeTrades = inngest.createFunction(
  {
    id:          'execute-trades',
    triggers:    [{ event: EXECUTION_REQUESTED_EVENT }],
    retries:     3,
    idempotency: 'event.data.execution_id',
    concurrency: { key: 'event.data.user_id', limit: 1 },
    onFailure: async ({ event, error }) => {
      const original = (event.data as { event?: { data?: unknown } } | undefined)?.event?.data
      const parsed = EventDataSchema.safeParse(original)
      if (!parsed.success) return
      const { execution_id, user_id, recommendation_id } = parsed.data
      const admin = createAdminClient()
      const { data: row } = await admin
        .from('alpaca_executions')
        .select('orders')
        .eq('id', execution_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (!row) return
      const current = parseStoredOrders(row.orders)
      if (isTerminalExecutionStatus(current.status)) return
      const orders = current.orders.map(o => (o.status === 'planned'
        ? { ...o, status: 'skipped' as const, error_message: 'Not submitted — execution stopped' }
        : o))
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 200)
      await admin
        .from('alpaca_executions')
        .update({ orders: buildEnvelope('failed', orders, new Date().toISOString(), { error_message: message, dry_run: current.dry_run }) })
        .eq('id', execution_id)
        .eq('user_id', user_id)
      // Best-effort: lets the notification function email the failure. Never throws.
      try {
        await inngest.send({
          name: EXECUTION_COMPLETED_EVENT,
          data: { execution_id, user_id, recommendation_id, status: 'failed' },
        })
      } catch {
        // Ignored — notifications are best-effort.
      }
    },
  },
  async ({ event, step }) => {
    const parsedEvent = EventDataSchema.safeParse(event.data)
    if (!parsedEvent.success) {
      throw new NonRetriableError('Invalid event payload: expected execution_id, user_id, recommendation_id')
    }
    const { execution_id, user_id, recommendation_id } = parsedEvent.data

    // ── 1. Load + validate the execution row ──────────────────────────────────
    const ctx = await step.run('load-execution', async (): Promise<{
      finished: boolean
      requestedAt: string
      dryRun: boolean
      pausedReason: string | null
    }> => {
      const admin = createAdminClient()
      const { data: row } = await admin
        .from('alpaca_executions')
        .select('id, user_id, recommendation_id, executed_at, orders')
        .eq('id', execution_id)
        .maybeSingle()
      if (!row) throw new NonRetriableError('Execution not found')
      if (row.user_id !== user_id || row.recommendation_id !== recommendation_id) {
        throw new NonRetriableError('Execution does not match the requesting user / recommendation')
      }
      const current = parseStoredOrders(row.orders)
      const safety = await loadSafetySettings(user_id)
      return {
        finished:     isTerminalExecutionStatus(current.status),
        requestedAt:  String(row.executed_at),
        // Dry run if it was requested as one OR the setting is on now — whichever is more conservative.
        dryRun:       current.dry_run || safety.dry_run,
        pausedReason: safety.trading_paused ? (safety.paused_reason ?? 'Paused') : null,
      }
    })
    if (ctx.finished) return { execution_id, status: 'already_finished' }

    const dryRun = ctx.dryRun
    const save = (status: ExecutionStatus, orders: AlpacaOrderResult[], extra?: { error_message?: string | null; wait_until?: string | null }) =>
      persist(execution_id, user_id, buildEnvelope(status, orders, new Date().toISOString(), { ...extra, dry_run: dryRun }))

    let orders: AlpacaOrderResult[] = []

    // Halt: cancel this execution's open orders, skip the rest, optionally engage the pause, end as "cancelled".
    const stop = async (reason: string, engagePause: boolean) => {
      const snapshot = orders
      await step.run('halt', async (): Promise<void> => {
        if (engagePause) await setTradingPause(user_id, true, reason)
        const nowIso = new Date().toISOString()
        let next = snapshot
        if (snapshot.some(o => isOrderOpen(o) && o.alpaca_order_id)) {
          const creds = await loadCreds(user_id)
          next = await Promise.all(snapshot.map(async (o) => {
            if (!isOrderOpen(o) || !o.alpaca_order_id) return o
            await cancelOrder(o.alpaca_order_id, creds.keyId, creds.secret, creds.isPaper)
            let latest = o
            try {
              latest = applyOrderSnapshot(o, await fetchOrder(o.alpaca_order_id, creds.keyId, creds.secret, creds.isPaper), nowIso)
            } catch {
              // keep last known state
            }
            return isOrderOpen(latest)
              ? { ...latest, status: 'canceled' as const, error_message: latest.error_message ?? `Cancel requested — ${reason}`, updated_at: nowIso }
              : latest
          }))
        }
        await save('cancelled', haltOrders(next, reason, nowIso), { error_message: `Cancelled — ${reason}` })
      })
      await step.sendEvent('emit-cancelled', {
        name: EXECUTION_COMPLETED_EVENT,
        data: { execution_id, user_id, recommendation_id, status: 'cancelled' },
      })
      if (engagePause) {
        // Automatic loss stop engaged the pause → trading_paused email (deduped per execution; delivered separately).
        await step.sendEvent('emit-paused-notification', notificationEvent(user_id, 'trading_paused', `loss-stop-${execution_id}`, {
          reason,
          source:    'loss_stop',
          paused_at: new Date().toISOString(),
        }))
      }
      return { execution_id, status: 'cancelled' as const }
    }

    if (ctx.pausedReason) return stop(`trading is paused (${ctx.pausedReason})`, false)

    const waitStartedMs = Number.isFinite(Date.parse(ctx.requestedAt)) ? Date.parse(ctx.requestedAt) : Date.now()

    // ── 2. Wait for the regular session (a dry run plans immediately) ────────
    for (let i = 0; !dryRun; i++) {
      const decision = await step.run(`check-market-${i}`, async (): Promise<MarketWaitDecision> => {
        const creds = await loadCreds(user_id)
        const clock = await fetchClock(creds.keyId, creds.secret, creds.isPaper)
        const d = i >= MAX_MARKET_CHECKS
          ? ({ action: 'give_up' } as const)
          : decideMarketWait(clock, Date.now(), waitStartedMs)
        if (d.action === 'wait') await save('waiting_for_market', [], { wait_until: d.until })
        if (d.action === 'give_up') await save('failed', [], { error_message: 'The market did not open within 4 days — nothing was traded' })
        return d
      })
      if (decision.action === 'proceed') break
      if (decision.action === 'give_up') {
        await step.sendEvent('emit-gave-up', {
          name: EXECUTION_COMPLETED_EVENT,
          data: { execution_id, user_id, recommendation_id, status: 'failed' },
        })
        return { execution_id, status: 'failed' }
      }
      await step.sleepUntil(`wait-for-market-${i}`, decision.until)
    }

    // ── 3. Plan ────────────────────────────────────────────────────────────────
    orders = await step.run('plan-orders', async (): Promise<AlpacaOrderResult[]> => {
      const creds = await loadCreds(user_id)
      const admin = createAdminClient()
      // select('*') so a missing optional column (e.g. shariah_screening) cannot break the query
      const { data: rec } = await admin
        .from('recommendations')
        .select('*')
        .eq('id', recommendation_id)
        .eq('user_id', user_id)
        .maybeSingle()
      if (!rec) throw new NonRetriableError('Recommendation not found')
      const items = ((rec.action_list ?? []) as ActionItem[]).filter(i => i.action !== 'hold')
      const screening = readShariahScreening(rec)
      const [safety, screeningConfig] = await Promise.all([loadSafetySettings(user_id), loadScreeningConfig(user_id)])
      // Shared planner: Shariah guard (CURRENT screening settings), settlement, sizing, then the hard risk limits.
      const plan = await buildRiskCheckedPlan(creds, { executionId: execution_id, items, screening, screeningConfig, limits: safety.limits })
      await save('executing', plan.orders)
      return plan.orders
    }) as AlpacaOrderResult[]

    // ── Dry run: everything above ran for real; nothing is submitted ─────────
    if (dryRun) {
      const check = await step.run('safety-check-dry-run', () => runSafetyCheck(execution_id, user_id))
      if (check.halt) return stop(check.halt, check.engagePause)
      const simulated = orders
      await step.run('finish-dry-run', async (): Promise<void> => {
        await save('dry_run_completed', markSimulated(simulated, new Date().toISOString()))
      })
      await step.sendEvent('emit-completed', {
        name: EXECUTION_COMPLETED_EVENT,
        data: { execution_id, user_id, recommendation_id, status: 'dry_run_completed' },
      })
      return { execution_id, status: 'dry_run_completed' }
    }

    // ── Helpers bound to this run ────────────────────────────────────────────
    /** Submit every planned order of one side. Returns a halt reason when the kill switch fired mid-way. */
    const submitSide = async (side: 'buy' | 'sell'): Promise<string | null> => {
      for (const order of orders.filter(o => o.action === side && o.status === 'planned')) {
        const snapshot = orders
        const res = await step.run(`submit-${side}-${order.ticker}`, async (): Promise<{ order: AlpacaOrderResult; halt: string | null }> => {
          // Kill switch — checked between every order.
          const halt = await readHaltReason(execution_id, user_id)
          if (halt) return { order, halt }
          if (side === 'buy') {
            // Shariah guard — re-checked against the stored screening immediately before every BUY.
            const admin = createAdminClient()
            const { data: rec } = await admin
              .from('recommendations').select('*').eq('id', recommendation_id).eq('user_id', user_id).maybeSingle()
            const block = getBuyBlockReason(order.ticker, readShariahScreening(rec), await loadScreeningConfig(user_id))
            if (block) {
              const skippedOrder: AlpacaOrderResult = { ...order, qty: 0, notional: null, estimated_value: 0, status: 'skipped', error_message: block }
              await save('executing', replaceOrder(snapshot, skippedOrder))
              return { order: skippedOrder, halt: null }
            }
          }
          const creds = await loadCreds(user_id)
          const result = await submitIdempotent(creds, order)
          await save('executing', replaceOrder(snapshot, result))
          return { order: result, halt: null }
        }) as { order: AlpacaOrderResult; halt: string | null }
        if (res.halt) return res.halt
        orders = replaceOrder(orders, res.order)
      }
      return null
    }

    const pollSide = async (side: 'buy' | 'sell') => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (!orders.some(o => o.action === side && isOrderOpen(o))) return
        await step.sleep(`${side}-poll-wait-${i}`, ORDER_POLL_INTERVAL)
        const snapshot = orders
        orders = await step.run(`${side}-poll-${i}`, async (): Promise<AlpacaOrderResult[]> => {
          const creds = await loadCreds(user_id)
          const nowIso = new Date().toISOString()
          const next = await Promise.all(snapshot.map(async (o) => {
            if (o.action !== side || !isOrderOpen(o) || !o.alpaca_order_id) return o
            try {
              return applyOrderSnapshot(o, await fetchOrder(o.alpaca_order_id, creds.keyId, creds.secret, creds.isPaper), nowIso)
            } catch {
              return o // transient — next poll tries again
            }
          }))
          await save('executing', next)
          return next
        }) as AlpacaOrderResult[]
      }

      // Timed out: cancel anything still open and record the final state.
      if (!orders.some(o => o.action === side && isOrderOpen(o))) return
      const snapshot = orders
      orders = await step.run(`${side}-cancel-stale`, async (): Promise<AlpacaOrderResult[]> => {
        const creds = await loadCreds(user_id)
        const nowIso = new Date().toISOString()
        const next = await Promise.all(snapshot.map(async (o) => {
          if (o.action !== side || !isOrderOpen(o) || !o.alpaca_order_id) return o
          await cancelOrder(o.alpaca_order_id, creds.keyId, creds.secret, creds.isPaper)
          let latest = o
          try {
            latest = applyOrderSnapshot(o, await fetchOrder(o.alpaca_order_id, creds.keyId, creds.secret, creds.isPaper), nowIso)
          } catch {
            // keep last known state
          }
          const note = `Cancelled after ${Math.round(ORDER_POLL_TIMEOUT_MS / 60_000)} minutes without completing`
          return isOrderOpen(latest) || latest.status === 'canceled'
            ? { ...latest, status: 'canceled' as const, error_message: latest.error_message ?? note, updated_at: nowIso }
            : latest
        }))
        await save('executing', next)
        return next
      }) as AlpacaOrderResult[]
    }

    // ── 4. SELLs first, wait for them to finish ──────────────────────────────
    if (orders.some(o => o.action === 'sell' && o.status === 'planned')) {
      const check = await step.run('safety-check-sells', () => runSafetyCheck(execution_id, user_id))
      if (check.halt) return stop(check.halt, check.engagePause)
      const halt = await submitSide('sell')
      if (halt) return stop(halt, false)
    }
    await pollSide('sell')

    // ── 5. Size BUYs to settled cash minus the cash buffer (never margin) ───
    if (orders.some(o => o.action === 'buy' && o.status === 'planned')) {
      const check = await step.run('safety-check-buys', () => runSafetyCheck(execution_id, user_id))
      if (check.halt) return stop(check.halt, check.engagePause)
      const snapshot = orders
      orders = await step.run('size-buys', async (): Promise<AlpacaOrderResult[]> => {
        const creds = await loadCreds(user_id)
        const clock = await fetchClock(creds.keyId, creds.secret, creds.isPaper)
        let next: AlpacaOrderResult[]
        if (!clock.is_open) {
          next = snapshot.map(o => (o.action === 'buy' && o.status === 'planned'
            ? { ...o, qty: 0, notional: null, estimated_value: 0, status: 'skipped' as const, error_message: 'Market closed before buys could be placed' }
            : o))
        } else {
          const account = await fetchBuyingInputs(creds.keyId, creds.secret, creds.isPaper)
          const safety = await loadSafetySettings(user_id)
          const capacity = bufferedBuyingCapacity(computeBuyingCapacity(account), account.cash, account.equity, safety.limits)
          next = scaleBuysToCapacity(snapshot, capacity)
        }
        await save('executing', next)
        return next
      }) as AlpacaOrderResult[]
    }

    // ── 6. BUYs ───────────────────────────────────────────────────────────────
    const buyHalt = await submitSide('buy')
    if (buyHalt) return stop(buyHalt, false)
    await pollSide('buy')

    // ── 7. Finish ─────────────────────────────────────────────────────────────
    const finalOrders = orders
    const finalStatus = await step.run('finish', async (): Promise<ExecutionStatus> => {
      const status = deriveExecutionStatus(finalOrders)
      await save(status, finalOrders)
      return status
    })

    await step.sendEvent('emit-completed', {
      name: EXECUTION_COMPLETED_EVENT,
      data: { execution_id, user_id, recommendation_id, status: finalStatus },
    })

    return { execution_id, status: finalStatus }
  },
)
