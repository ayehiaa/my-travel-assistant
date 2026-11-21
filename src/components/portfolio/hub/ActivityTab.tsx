import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { normalizeExecution } from '@/lib/tradeExecution'
import { effectiveApprovalStatus, readAutopilotInfo } from '@/lib/autopilot'
import { formatUsd as formatCostUsd, readRunUsage } from '@/lib/aiCost'
import { hubHref } from '@/lib/portfolioHub'
import {
  ACTIVITY_AUDIT_ACTIONS,
  ACTIVITY_EMPTY_STATE,
  ACTIVITY_FILTERS,
  ACTIVITY_MAX_PAGES,
  ACTIVITY_FILTER_LABELS,
  ACTIVITY_PAGE_SIZE,
  approvalActivity,
  auditActivity,
  executionActivity,
  filterTimeline,
  mergeTimeline,
  notificationActivity,
  paginateTimeline,
  runActivity,
  type ActivityFilter,
  type ActivityItem,
  type ActivityTone,
} from '@/lib/activityTimeline'

interface Props {
  userId: string
  filter: ActivityFilter
  page: number
}

const TONE_DOT: Record<ActivityTone, string> = {
  neutral: 'bg-[var(--ink-4)]',
  info:    'bg-[var(--blue-500)]',
  good:    'bg-emerald-500',
  warn:    'bg-amber-500',
  bad:     'bg-red-500',
}

const KIND_LABEL: Record<ActivityItem['kind'], string> = {
  run:          'Run',
  approval:     'Approval',
  execution:    'Orders',
  notification: 'Alert',
  audit:        'Change',
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

/**
 * Activity tab: one newest-first timeline of runs, approvals, executions, emails and portfolio settings / safety
 * changes. Page N reads the newest N×30 (+1) rows of each source, so every page up to the cap is exact.
 */
export default async function ActivityTab({ userId, filter, page }: Props) {
  const supabase = await createClient()
  const limit = page * ACTIVITY_PAGE_SIZE + 1

  const [recRes, execRes, notifRes, auditRes] = await Promise.all([
    supabase
      .from('recommendations')
      .select('id, run_at, status, error_message, autopilot:agent_outputs->autopilot, usage:agent_outputs->usage')
      .eq('user_id', userId)
      .order('run_at', { ascending: false })
      .limit(limit),
    supabase
      .from('alpaca_executions')
      .select('*')
      .eq('user_id', userId)
      .order('executed_at', { ascending: false })
      .limit(limit),
    // Best-effort: the table only exists once migration 20261120e is applied
    supabase
      .from('notification_log')
      .select('id, type, entity_id, status, error, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('audit_log')
      .select('id, action, created_at, changed_fields')
      .eq('performed_by', userId)
      .in('action', Object.keys(ACTIVITY_AUDIT_ACTIONS))
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  const now = new Date()
  const recs = (recRes.data ?? []) as unknown as Array<{
    id: string; run_at: string; status: string; error_message: string | null; autopilot: unknown; usage: unknown
  }>
  const executions = (execRes.data ?? []).map(row => normalizeExecution(row as Parameters<typeof normalizeExecution>[0]))

  const runItems: Array<ActivityItem | null> = []
  for (const r of recs) {
    const outputs = { agent_outputs: { autopilot: r.autopilot, usage: r.usage } }
    const info = readAutopilotInfo(outputs)
    const usage = readRunUsage(outputs)
    runItems.push(runActivity({
      id:            r.id,
      run_at:        r.run_at,
      status:        r.status,
      error_message: r.error_message,
      trigger:       info.trigger,
      cost_label:    usage ? `${usage.partial ? '≥ ' : ''}${formatCostUsd(usage.cost_usd)}` : null,
    }))
    if (info.trigger === 'schedule') {
      runItems.push(approvalActivity({
        recommendation_id: r.id,
        status:            effectiveApprovalStatus(info, now),
        decided_at:        info.approval_decided_at,
        expires_at:        info.approval_expires_at,
      }))
    }
  }

  const recIds = new Set(recs.map(r => r.id))
  const execToRec = new Map(executions.map(e => [e.id, e.recommendation_id]))
  const recommendationIdFor = (entityId: string) => (recIds.has(entityId) ? entityId : execToRec.get(entityId) ?? null)

  const timeline = mergeTimeline(
    runItems,
    executions.map(executionActivity),
    notifRes.error ? [] : (notifRes.data ?? []).map(n => notificationActivity(n as Parameters<typeof notificationActivity>[0], recommendationIdFor)),
    (auditRes.data ?? []).map(a => auditActivity(a as Parameters<typeof auditActivity>[0])),
  )
  const paged = paginateTimeline(filterTimeline(timeline, filter), page)
  const items = paged.items
  const hasMore = paged.hasMore && page < ACTIVITY_MAX_PAGES

  return (
    <div className="min-w-0 space-y-4">
      <nav aria-label="Filter activity" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2">
          {ACTIVITY_FILTERS.map(f => (
            <li key={f}>
              <Link
                href={hubHref({ tab: 'activity', filter: f === 'all' ? null : f })}
                aria-current={f === filter ? 'true' : undefined}
                className={`inline-block whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  f === filter
                    ? 'border-[var(--blue-700)] bg-[var(--blue-700)] text-white'
                    : 'border-[var(--rule)] bg-white text-[var(--ink-2)] hover:border-[var(--ink-4)]'
                }`}
              >
                {ACTIVITY_FILTER_LABELS[f]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {notifRes.error && (filter === 'all' || filter === 'alerts') && (
        <p className="text-xs text-[var(--ink-4)]">Email history is not available yet (the notifications database update has not been applied).</p>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-[var(--rule)] px-6 py-10 text-center">
          <p className="font-semibold text-[var(--ink-2)]">{ACTIVITY_EMPTY_STATE[filter].title}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--ink-3)]">{ACTIVITY_EMPTY_STATE[filter].detail}</p>
          {filter === 'runs' && (
            <Link href={hubHref({ tab: 'rebalance' })} className="mt-3 inline-block text-sm font-semibold text-[var(--blue-700)]">
              Go to Rebalance →
            </Link>
          )}
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map(item => (
            <li key={item.key} className="min-w-0 rounded-xl border border-[var(--rule)] bg-white p-3 md:p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-semibold text-[var(--ink)]">{item.title}</span>
                    <span className="rounded bg-[var(--paper-3)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                      {KIND_LABEL[item.kind]}
                    </span>
                    {item.badges.map(b => (
                      <span
                        key={b}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          b === 'Dry run' ? 'bg-purple-100 text-purple-700' : 'bg-[var(--paper-2)] text-[var(--ink-3)]'
                        }`}
                      >
                        {b}
                      </span>
                    ))}
                    {item.open && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">Open</span>}
                  </div>
                  {item.detail && <p className="mt-0.5 break-words text-xs text-[var(--ink-3)]">{item.detail}</p>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <time dateTime={item.at} className="text-xs text-[var(--ink-3)]">{formatWhen(item.at)}</time>
                    {item.recommendation_id && (
                      <Link href={`/portfolio/recommendations/${item.recommendation_id}`} className="text-xs font-semibold text-[var(--blue-700)]">
                        View recommendation →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="Activity pages" className="flex items-center justify-between gap-3 border-t border-[var(--rule-soft)] pt-3 text-sm">
          {page > 1 ? (
            <Link href={hubHref({ tab: 'activity', filter: filter === 'all' ? null : filter, page: page - 1 === 1 ? null : page - 1 })} className="font-semibold text-[var(--blue-700)]">
              ← Newer
            </Link>
          ) : <span />}
          <span className="text-xs text-[var(--ink-3)]">Page {page}</span>
          {hasMore ? (
            <Link href={hubHref({ tab: 'activity', filter: filter === 'all' ? null : filter, page: page + 1 })} className="font-semibold text-[var(--blue-700)]">
              Older →
            </Link>
          ) : <span />}
        </nav>
      )}
    </div>
  )
}
