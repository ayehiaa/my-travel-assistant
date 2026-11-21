import { settingsHref } from '@/lib/portfolioHub'
import {
  escapeHtml,
  formatNyDate,
  formatNyUk,
  formatPct,
  formatSignedUsd,
  formatUsd,
  truncate,
} from './format'
import type {
  ApprovalExpiredPayload,
  ApprovalNeededPayload,
  EmailKind,
  ExecutionPayload,
  NotificationPayloads,
  OrderOutcomeLine,
  RenderedEmail,
  RunCompletedPayload,
  ShariahStatusChangePayload,
  TestPayload,
  TradeLine,
  TradingPausedPayload,
  TradingResumedPayload,
  WeeklySummaryPayload,
} from './types'

/**
 * Pure email template builders (specs/023-trading-notifications): subject + plain text + simple inline-styled HTML.
 * Every dynamic string is HTML-escaped. No API keys or account numbers ever appear (payloads do not carry them).
 */

export interface TemplateContext {
  baseUrl: string
}

const C = {
  ink:    '#111827',
  body:   '#374151',
  muted:  '#6b7280',
  rule:   '#e5e7eb',
  blue:   '#1d4ed8',
  green:  '#15803d',
  red:    '#b91c1c',
  amber:  '#92400e',
  purple: '#6d28d9',
}

// ── HTML building blocks ─────────────────────────────────────────────────────

function layout(title: string, bodyHtml: string, ctx: TemplateContext): string {
  const settingsUrl = `${ctx.baseUrl}${settingsHref('notifications')}`
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:${C.blue};border-radius:12px 12px 0 0;padding:18px 28px;">
      <span style="font-size:18px;font-weight:700;color:#ffffff;">Sojourn Portfolio</span>
    </div>
    <div style="background:#ffffff;border:1px solid ${C.rule};border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      <h1 style="font-size:20px;font-weight:700;color:${C.ink};margin:0 0 16px;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid ${C.rule};margin:24px 0 12px;">
      <p style="font-size:12px;color:${C.muted};margin:0;">
        You can turn these emails off in <a href="${escapeHtml(settingsUrl)}" style="color:${C.blue};">Portfolio Settings → Notifications</a>.
        Not investment advice.
      </p>
    </div>
  </div>
</body>
</html>`
}

function p(text: string, color = C.body): string {
  return `<p style="font-size:15px;line-height:1.6;color:${color};margin:0 0 14px;">${text}</p>`
}

function button(label: string, href: string): string {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${C.blue};color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;">${escapeHtml(label)}</a></p>`
}

function callout(html: string, tone: 'amber' | 'red' | 'green' | 'purple'): string {
  const tones = {
    amber:  { bg: '#fef3c7', border: '#fcd34d', color: C.amber },
    red:    { bg: '#fee2e2', border: '#fca5a5', color: C.red },
    green:  { bg: '#dcfce7', border: '#86efac', color: C.green },
    purple: { bg: '#ede9fe', border: '#c4b5fd', color: C.purple },
  }[tone]
  return `<div style="background:${tones.bg};border:1px solid ${tones.border};border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.5;color:${tones.color};">${html}</div>`
}

function table(headers: string[], rows: string[][], alignRight: number[] = []): string {
  const th = headers
    .map((h, i) => `<th style="text-align:${alignRight.includes(i) ? 'right' : 'left'};font-size:12px;color:${C.muted};font-weight:600;padding:6px 8px;border-bottom:1px solid ${C.rule};">${escapeHtml(h)}</th>`)
    .join('')
  const tr = rows
    .map(r => `<tr>${r.map((cell, i) => `<td style="text-align:${alignRight.includes(i) ? 'right' : 'left'};font-size:14px;color:${C.ink};padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top;">${cell}</td>`).join('')}</tr>`)
    .join('')
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`
}

function actionLabel(a: 'buy' | 'sell'): string {
  return a === 'buy' ? 'BUY' : 'SELL'
}

function actionCell(a: 'buy' | 'sell'): string {
  return `<span style="font-weight:700;color:${a === 'buy' ? C.green : C.red};">${actionLabel(a)}</span>`
}

function recommendationUrl(ctx: TemplateContext, id: string): string {
  return `${ctx.baseUrl}/portfolio/recommendations/${encodeURIComponent(id)}`
}

function textFooter(ctx: TemplateContext): string {
  return `\n\n—\nTurn these emails off in Portfolio Settings → Notifications: ${ctx.baseUrl}${settingsHref('notifications')}\nNot investment advice.`
}

function tradesText(trades: TradeLine[]): string {
  return trades.map(t => `  ${actionLabel(t.action).padEnd(4)} ${t.ticker.padEnd(6)} ${formatUsd(t.amount_usd)}`).join('\n')
}

function tradesTable(trades: TradeLine[]): string {
  return table(
    ['Action', 'Ticker', 'Amount'],
    trades.map(t => [actionCell(t.action), escapeHtml(t.ticker), escapeHtml(formatUsd(t.amount_usd))]),
    [2],
  )
}

// ── Templates ────────────────────────────────────────────────────────────────

function runCompleted(d: RunCompletedPayload, ctx: TemplateContext): RenderedEmail {
  const url = recommendationUrl(ctx, d.recommendation_id)
  const kind = d.trigger === 'schedule' ? 'Scheduled analysis' : 'Analysis'
  const subject = d.trade_count > 0
    ? `${kind} complete — ${d.trade_count} trade${d.trade_count === 1 ? '' : 's'} recommended`
    : `${kind} complete — no trades recommended`
  const summary = d.summary ? truncate(d.summary.trim(), 700) : null
  const more = d.trade_count > d.top_trades.length ? d.trade_count - d.top_trades.length : 0

  const text = [
    `${kind} complete.`,
    d.total_value_usd !== null ? `Portfolio value: ${formatUsd(d.total_value_usd)}` : null,
    summary ? `\n${summary}` : null,
    d.top_trades.length > 0 ? `\nTop trades:\n${tradesText(d.top_trades)}${more > 0 ? `\n  …and ${more} more` : ''}` : '\nNo trades recommended.',
    `\nView the recommendation: ${url}`,
  ].filter(Boolean).join('\n') + textFooter(ctx)

  const html = layout(subject, [
    d.total_value_usd !== null ? p(`Portfolio value: <strong>${escapeHtml(formatUsd(d.total_value_usd))}</strong>`) : '',
    summary ? p(escapeHtml(summary)) : '',
    d.top_trades.length > 0
      ? `<h2 style="font-size:15px;color:${C.ink};margin:8px 0;">Top trades</h2>${tradesTable(d.top_trades)}${more > 0 ? p(`…and ${more} more`, C.muted) : ''}`
      : p('No trades recommended.'),
    button('View recommendation', url),
  ].join(''), ctx)

  return { subject, text, html }
}

function approvalNeeded(d: ApprovalNeededPayload, ctx: TemplateContext): RenderedEmail {
  const url = recommendationUrl(ctx, d.recommendation_id)
  const expires = formatNyUk(d.expires_at)
  const subject = `Approval needed — ${d.trade_count} trade${d.trade_count === 1 ? '' : 's'} waiting (expires ${expires})`
  const mode = d.dry_run ? 'Dry run is ON — approving runs a simulation; no real orders are placed.' : 'Dry run is OFF — approving places real orders.'

  const text = [
    'A scheduled recommendation is waiting for your approval.',
    `Expires: ${expires}`,
    mode,
    d.top_trades.length > 0 ? `\nTop trades:\n${tradesText(d.top_trades)}` : '\nNo trades recommended.',
    `\nReview and approve: ${url}`,
    'If you do nothing, nothing is executed.',
  ].join('\n') + textFooter(ctx)

  const html = layout('Approval needed', [
    p('A scheduled recommendation is waiting for your approval.'),
    callout(`<strong>Expires ${escapeHtml(expires)}</strong><br>If you do nothing, nothing is executed.`, 'amber'),
    p(escapeHtml(mode), d.dry_run ? C.purple : C.red),
    d.top_trades.length > 0 ? tradesTable(d.top_trades) : p('No trades recommended.'),
    button('Review & approve', url),
  ].join(''), ctx)

  return { subject, text, html }
}

function approvalExpired(d: ApprovalExpiredPayload, ctx: TemplateContext): RenderedEmail {
  const url = recommendationUrl(ctx, d.recommendation_id)
  const when = formatNyUk(d.expired_at)
  const subject = 'Approval expired — nothing was executed'
  const text = [
    `The approval window for a scheduled recommendation closed (${when}).`,
    'Nothing was executed. The next scheduled run will produce a new recommendation.',
    `\nView: ${url}`,
  ].join('\n') + textFooter(ctx)
  const html = layout(subject, [
    p(`The approval window for a scheduled recommendation closed (${escapeHtml(when)}).`),
    p('Nothing was executed. The next scheduled run will produce a new recommendation.'),
    button('View recommendation', url),
  ].join(''), ctx)
  return { subject, text, html }
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  filled:           'Filled',
  partially_filled: 'Partially filled',
  submitted:        'Submitted',
  planned:          'Planned',
  canceled:         'Cancelled',
  expired:          'Expired',
  rejected:         'Rejected',
  error:            'Error',
  skipped:          'Skipped',
  simulated:        'Simulated',
}

function orderStatusLabel(s: string): string {
  return ORDER_STATUS_LABELS[s] ?? s
}

function ordersTable(orders: OrderOutcomeLine[]): string {
  return table(
    ['Side', 'Ticker', 'Amount', 'Status', 'Fill price'],
    orders.map(o => [
      actionCell(o.action),
      escapeHtml(o.ticker),
      escapeHtml(formatUsd(o.amount_usd)),
      `${escapeHtml(orderStatusLabel(o.status))}${o.note ? `<br><span style="font-size:12px;color:${C.muted};">${escapeHtml(truncate(o.note, 160))}</span>` : ''}`,
      escapeHtml(o.filled_avg_price !== null ? formatUsd(o.filled_avg_price) : '—'),
    ]),
    [2, 4],
  )
}

function ordersText(orders: OrderOutcomeLine[]): string {
  return orders
    .map(o => {
      const fill = o.filled_avg_price !== null ? ` @ ${formatUsd(o.filled_avg_price)}` : ''
      const note = o.note ? ` — ${truncate(o.note, 160)}` : ''
      return `  ${actionLabel(o.action).padEnd(4)} ${o.ticker.padEnd(6)} ${formatUsd(o.amount_usd).padStart(12)}  ${orderStatusLabel(o.status)}${fill}${note}`
    })
    .join('\n')
}

function execution(kind: 'execution_completed' | 'execution_completed_with_errors' | 'execution_failed' | 'dry_run_completed', d: ExecutionPayload, ctx: TemplateContext): RenderedEmail {
  const url = recommendationUrl(ctx, d.recommendation_id)
  const account = d.is_paper ? 'paper account' : 'live account'
  const cancelled = d.status === 'cancelled'
  const filled = d.orders.filter(o => o.status === 'filled' || o.status === 'partially_filled').length
  const failed = d.orders.filter(o => ['rejected', 'error', 'canceled', 'expired'].includes(o.status)).length

  let subject: string
  let intro: string
  let tone: 'green' | 'amber' | 'red' | 'purple'
  switch (kind) {
    case 'execution_completed':
      subject = `Trades executed — ${filled} order${filled === 1 ? '' : 's'} filled (${account})`
      intro = `All orders completed on your ${account}.`
      tone = 'green'
      break
    case 'execution_completed_with_errors':
      subject = `Trades executed with errors — ${filled} filled, ${failed} failed (${account})`
      intro = `The execution finished on your ${account}, but some orders failed or were skipped. Check the table below.`
      tone = 'amber'
      break
    case 'dry_run_completed':
      subject = `Dry run complete — ${d.orders.length} order${d.orders.length === 1 ? '' : 's'} simulated`
      intro = 'Dry run is ON, so nothing was sent to Alpaca. This is what would have been traded.'
      tone = 'purple'
      break
    default:
      subject = cancelled ? `Execution cancelled (${account})` : `Execution failed (${account})`
      intro = cancelled
        ? 'The execution was stopped before it finished. Orders not yet submitted were skipped.'
        : 'The execution failed. Orders not yet submitted were skipped.'
      tone = 'red'
  }

  const reason = d.error_message ? truncate(d.error_message, 300) : null
  const text = [
    intro,
    reason ? `Reason: ${reason}` : null,
    d.orders.length > 0 ? `\nOrders:\n${ordersText(d.orders)}` : '\nNo orders were placed.',
    `\nView: ${url}`,
  ].filter(Boolean).join('\n') + textFooter(ctx)

  const html = layout(subject, [
    callout(escapeHtml(intro) + (reason ? `<br><strong>Reason:</strong> ${escapeHtml(reason)}` : ''), tone),
    d.orders.length > 0 ? ordersTable(d.orders) : p('No orders were placed.'),
    button('View recommendation', url),
  ].join(''), ctx)

  return { subject, text, html }
}

function tradingPaused(d: TradingPausedPayload, ctx: TemplateContext): RenderedEmail {
  const when = formatNyUk(d.paused_at)
  const source = d.source === 'loss_stop' ? 'An automatic loss stop paused trading.' : 'Trading was paused with the kill switch.'
  const subject = d.source === 'loss_stop' ? 'Trading paused — loss stop triggered' : 'Trading paused'
  const reason = truncate(d.reason, 300)
  const url = `${ctx.baseUrl}${settingsHref('safety')}`
  const text = [
    source,
    `Reason: ${reason}`,
    `When: ${when}`,
    'No new executions will run until you resume trading in Portfolio Settings.',
    `\n${url}`,
  ].join('\n') + textFooter(ctx)
  const html = layout(subject, [
    callout(`${escapeHtml(source)}<br><strong>Reason:</strong> ${escapeHtml(reason)}`, 'red'),
    p(`When: ${escapeHtml(when)}`),
    p('No new executions will run until you resume trading in Portfolio Settings.'),
    button('Open Portfolio Settings', url),
  ].join(''), ctx)
  return { subject, text, html }
}

function tradingResumed(d: TradingResumedPayload, ctx: TemplateContext): RenderedEmail {
  const when = formatNyUk(d.resumed_at)
  const subject = 'Trading resumed'
  const text = [
    `Trading was resumed (${when}).`,
    'Executions can run again, within your risk limits and dry-run setting.',
    'If this was not you, pause trading immediately in Portfolio Settings.',
  ].join('\n') + textFooter(ctx)
  const html = layout(subject, [
    callout(`Trading was resumed (${escapeHtml(when)}).`, 'green'),
    p('Executions can run again, within your risk limits and dry-run setting.'),
    p('If this was not you, pause trading immediately in Portfolio Settings.', C.red),
    button('Open Portfolio Settings', `${ctx.baseUrl}${settingsHref('safety')}`),
  ].join(''), ctx)
  return { subject, text, html }
}

function shariahStatusChange(d: ShariahStatusChangePayload, ctx: TemplateContext): RenderedEmail {
  const url = recommendationUrl(ctx, d.recommendation_id)
  const tickers = d.items.map(i => i.ticker).join(', ')
  const subject = `Divest: ${tickers} no longer Shariah-compliant`
  const sellLine = (has: boolean) => (has ? 'The recommendation includes a SELL.' : 'No SELL in this recommendation — review it.')

  const text = [
    'A holding that was Shariah-compliant in your previous recommendation failed screening in the latest run.',
    '',
    ...d.items.map(i => `${i.ticker}${i.name ? ` (${i.name})` : ''}: ${i.reasons.join('; ')}\n  ${sellLine(i.has_sell)}`),
    `\nReview the recommendation: ${url}`,
  ].join('\n') + textFooter(ctx)

  const html = layout(`Divest: ${tickers}`, [
    p('A holding that was Shariah-compliant in your previous recommendation failed screening in the latest run.'),
    table(
      ['Ticker', 'Reason', 'Recommendation'],
      d.items.map(i => [
        `<strong>${escapeHtml(i.ticker)}</strong>${i.name ? `<br><span style="font-size:12px;color:${C.muted};">${escapeHtml(i.name)}</span>` : ''}`,
        escapeHtml(i.reasons.join('; ')),
        i.has_sell
          ? `<span style="font-weight:700;color:${C.red};">SELL included</span>`
          : `<span style="color:${C.amber};">No SELL — review</span>`,
      ]),
    ),
    button('Review recommendation', url),
  ].join(''), ctx)
  return { subject, text, html }
}

const EXECUTION_STATUS_LABELS: Record<string, string> = {
  completed:             'Completed',
  completed_with_errors: 'Completed with errors',
  failed:                'Failed',
  cancelled:             'Cancelled',
  dry_run_completed:     'Dry run',
  pending:               'Pending',
  waiting_for_market:    'Waiting for market',
  executing:             'Executing',
}

function weeklySummary(d: WeeklySummaryPayload, ctx: TemplateContext): RenderedEmail {
  const week = formatNyDate(d.week_ending)
  const subject = `Weekly portfolio summary — week ending ${week}`
  const pnlText = d.pnl
    ? `${formatSignedUsd(d.pnl.change_usd)} (${formatPct(d.pnl.change_pct)}) — ${formatUsd(d.pnl.start_equity)} → ${formatUsd(d.pnl.end_equity)}`
    : 'Not available'
  const runLines = d.runs.map(r => `  ${formatNyDate(r.run_at)}  ${r.trigger === 'schedule' ? 'Scheduled' : 'Manual'}  ${r.status}`)
  const execLines = d.executions.map(e => `  ${formatNyDate(e.executed_at)}  ${EXECUTION_STATUS_LABELS[e.status] ?? e.status}${e.dry_run ? ' (dry run)' : ''}  ${e.order_count} order${e.order_count === 1 ? '' : 's'}`)
  const shariahText = d.shariah
    ? [
        `Compliant holdings: ${d.shariah.compliant.length > 0 ? d.shariah.compliant.join(', ') : 'none'}`,
        d.shariah.non_compliant.length > 0
          ? `NOT compliant: ${d.shariah.non_compliant.map(n => `${n.ticker} (${n.reason})`).join('; ')}`
          : 'No non-compliant holdings.',
      ].join('\n')
    : 'No screening yet.'

  const text = [
    `Week ending ${week}`,
    `\nChange in account value: ${pnlText}`,
    `\nAnalysis runs (${d.runs.length}):`,
    runLines.length > 0 ? runLines.join('\n') : '  none',
    `\nExecutions (${d.executions.length}):`,
    execLines.length > 0 ? execLines.join('\n') : '  none',
    `\nShariah status:\n${shariahText}`,
    `\nOpen your portfolio: ${ctx.baseUrl}/portfolio`,
  ].join('\n') + textFooter(ctx)

  const pnlColor = d.pnl ? (d.pnl.change_usd >= 0 ? C.green : C.red) : C.muted
  const html = layout(subject, [
    `<div style="border:1px solid ${C.rule};border-radius:8px;padding:12px 14px;margin:0 0 16px;">
      <div style="font-size:12px;color:${C.muted};">Change in account value (1 week)</div>
      <div style="font-size:20px;font-weight:700;color:${pnlColor};">${escapeHtml(d.pnl ? `${formatSignedUsd(d.pnl.change_usd)} (${formatPct(d.pnl.change_pct)})` : 'Not available')}</div>
      ${d.pnl ? `<div style="font-size:12px;color:${C.muted};">${escapeHtml(`${formatUsd(d.pnl.start_equity)} → ${formatUsd(d.pnl.end_equity)} · includes deposits/withdrawals`)}</div>` : ''}
    </div>`,
    `<h2 style="font-size:15px;color:${C.ink};margin:8px 0;">Analysis runs (${d.runs.length})</h2>`,
    d.runs.length > 0
      ? table(['Date', 'Trigger', 'Status'], d.runs.map(r => [escapeHtml(formatNyDate(r.run_at)), r.trigger === 'schedule' ? 'Scheduled' : 'Manual', escapeHtml(r.status)]))
      : p('None this week.', C.muted),
    `<h2 style="font-size:15px;color:${C.ink};margin:8px 0;">Executions (${d.executions.length})</h2>`,
    d.executions.length > 0
      ? table(['Date', 'Status', 'Orders'], d.executions.map(e => [
          escapeHtml(formatNyDate(e.executed_at)),
          escapeHtml(`${EXECUTION_STATUS_LABELS[e.status] ?? e.status}${e.dry_run ? ' (dry run)' : ''}`),
          String(e.order_count),
        ]), [2])
      : p('None this week.', C.muted),
    `<h2 style="font-size:15px;color:${C.ink};margin:8px 0;">Shariah status</h2>`,
    d.shariah
      ? [
          p(`Compliant holdings: ${escapeHtml(d.shariah.compliant.length > 0 ? d.shariah.compliant.join(', ') : 'none')}`),
          d.shariah.non_compliant.length > 0
            ? callout(`<strong>Not compliant:</strong> ${d.shariah.non_compliant.map(n => `${escapeHtml(n.ticker)} (${escapeHtml(n.reason)})`).join('; ')}`, 'red')
            : p('No non-compliant holdings.', C.green),
        ].join('')
      : p('No screening yet.', C.muted),
    button('Open portfolio', `${ctx.baseUrl}/portfolio`),
  ].join(''), ctx)

  return { subject, text, html }
}

function testEmail(d: TestPayload, ctx: TemplateContext): RenderedEmail {
  const subject = 'Test email — Sojourn notifications are working'
  const when = formatNyUk(d.sent_at)
  const text = `This is a test email sent ${when}. Your notification emails will arrive at this address.` + textFooter(ctx)
  const html = layout('Notifications are working', [
    p(`This is a test email sent ${escapeHtml(when)}.`),
    p('Your notification emails will arrive at this address.'),
  ].join(''), ctx)
  return { subject, text, html }
}

/** Build the email for a notification kind. */
export function buildNotificationEmail<K extends EmailKind>(
  kind: K,
  payload: NotificationPayloads[K],
  ctx: TemplateContext,
): RenderedEmail {
  switch (kind) {
    case 'run_completed':        return runCompleted(payload as RunCompletedPayload, ctx)
    case 'approval_needed':      return approvalNeeded(payload as ApprovalNeededPayload, ctx)
    case 'approval_expired':     return approvalExpired(payload as ApprovalExpiredPayload, ctx)
    case 'execution_completed':
    case 'execution_completed_with_errors':
    case 'execution_failed':
    case 'dry_run_completed':    return execution(kind, payload as ExecutionPayload, ctx)
    case 'trading_paused':       return tradingPaused(payload as TradingPausedPayload, ctx)
    case 'trading_resumed':      return tradingResumed(payload as TradingResumedPayload, ctx)
    case 'shariah_status_change': return shariahStatusChange(payload as ShariahStatusChangePayload, ctx)
    case 'weekly_summary':       return weeklySummary(payload as WeeklySummaryPayload, ctx)
    case 'test':                 return testEmail(payload as TestPayload, ctx)
    default:                     throw new Error(`Unknown notification kind: ${String(kind)}`)
  }
}
