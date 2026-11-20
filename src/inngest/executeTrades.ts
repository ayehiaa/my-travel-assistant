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
import {
  ORDER_POLL_INTERVAL,
  ORDER_POLL_INTERVAL_MS,
  ORDER_POLL_TIMEOUT_MS,
  applyOrderSnapshot,
  buildEnvelope,
  computeBuyingCapacity,
  decideMarketWait,
  deriveExecutionStatus,
  isOrderOpen,
  isTerminalExecutionStatus,
  loadPlanInputs,
  parseStoredOrders,
  planOrders,
  scaleBuysToCapacity,
  type MarketWaitDecision,
  type TradingCredentials,
} from '@/lib/tradeExecution'
import { EXECUTION_COMPLETED_EVENT, EXECUTION_REQUESTED_EVENT } from '@/lib/tradeExecutionRequest'
import type { ActionItem, AlpacaOrderResult, ExecutionEnvelope, ExecutionStatus } from '@/types/database'

/**
 * Order execution engine. Triggered by portfolio/execution.requested { execution_id, user_id, recommendation_id }.
 *
 * check market (sleep until open) → plan → submit SELLs → poll until terminal (≤30m, cancel stale)
 * → size BUYs to settled cash → submit BUYs (Shariah re-check) → poll (≤30m, cancel stale) → finish.
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

async function persist(executionId: string, userId: string, envelope: ExecutionEnvelope): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('alpaca_executions')
    .update({ orders: envelope })
    .eq('id', executionId)
    .eq('user_id', userId)
  if (error) throw new Error('Failed to save execution state')
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
      const { execution_id, user_id } = parsed.data
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
        .update({ orders: buildEnvelope('failed', orders, new Date().toISOString(), { error_message: message }) })
        .eq('id', execution_id)
        .eq('user_id', user_id)
    },
  },
  async ({ event, step }) => {
    const parsedEvent = EventDataSchema.safeParse(event.data)
    if (!parsedEvent.success) {
      throw new NonRetriableError('Invalid event payload: expected execution_id, user_id, recommendation_id')
    }
    const { execution_id, user_id, recommendation_id } = parsedEvent.data
    const save = (status: ExecutionStatus, orders: AlpacaOrderResult[], extra?: { error_message?: string | null; wait_until?: string | null }) =>
      persist(execution_id, user_id, buildEnvelope(status, orders, new Date().toISOString(), extra))

    // ── 1. Load + validate the execution row ──────────────────────────────────
    const ctx = await step.run('load-execution', async (): Promise<{ finished: boolean; requestedAt: string }> => {
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
      return { finished: isTerminalExecutionStatus(current.status), requestedAt: String(row.executed_at) }
    })
    if (ctx.finished) return { execution_id, status: 'already_finished' }

    const waitStartedMs = Number.isFinite(Date.parse(ctx.requestedAt)) ? Date.parse(ctx.requestedAt) : Date.now()

    // ── 2. Wait for the regular session ───────────────────────────────────────
    for (let i = 0; ; i++) {
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
      if (decision.action === 'give_up') return { execution_id, status: 'failed' }
      await step.sleepUntil(`wait-for-market-${i}`, decision.until)
    }

    // ── 3. Plan ────────────────────────────────────────────────────────────────
    let orders = await step.run('plan-orders', async (): Promise<AlpacaOrderResult[]> => {
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
      const inputs = await loadPlanInputs(creds, items, screening)
      const planned = planOrders({ executionId: execution_id, items, screening, ...inputs })
      await save('executing', planned)
      return planned
    }) as AlpacaOrderResult[]

    // ── Helpers bound to this run ────────────────────────────────────────────
    const submitSide = async (side: 'buy' | 'sell') => {
      for (const order of orders.filter(o => o.action === side && o.status === 'planned')) {
        const snapshot = orders
        const updated = await step.run(`submit-${side}-${order.ticker}`, async (): Promise<AlpacaOrderResult> => {
          if (side === 'buy') {
            // Shariah guard — re-checked against the stored screening immediately before every BUY.
            const admin = createAdminClient()
            const { data: rec } = await admin
              .from('recommendations').select('*').eq('id', recommendation_id).eq('user_id', user_id).maybeSingle()
            const block = getBuyBlockReason(order.ticker, readShariahScreening(rec))
            if (block) {
              const skippedOrder: AlpacaOrderResult = { ...order, qty: 0, notional: null, estimated_value: 0, status: 'skipped', error_message: block }
              await save('executing', replaceOrder(snapshot, skippedOrder))
              return skippedOrder
            }
          }
          const creds = await loadCreds(user_id)
          const result = await submitIdempotent(creds, order)
          await save('executing', replaceOrder(snapshot, result))
          return result
        }) as AlpacaOrderResult
        orders = replaceOrder(orders, updated)
      }
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
    await submitSide('sell')
    await pollSide('sell')

    // ── 5. Size BUYs to settled cash (never margin) ─────────────────────────
    if (orders.some(o => o.action === 'buy' && o.status === 'planned')) {
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
          next = scaleBuysToCapacity(snapshot, computeBuyingCapacity(account))
        }
        await save('executing', next)
        return next
      }) as AlpacaOrderResult[]
    }

    // ── 6. BUYs ───────────────────────────────────────────────────────────────
    await submitSide('buy')
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
