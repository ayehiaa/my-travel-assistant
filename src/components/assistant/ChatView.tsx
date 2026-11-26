'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AssistantArea } from '@/lib/assistant/areas'
import { suggestionGroups } from '@/lib/assistant/areas'
import type { UiAssistantMessage, UiMessage } from '@/lib/assistant/history'
import { splitFollowUps } from '@/lib/assistant/text'
import { usedSummary } from '@/lib/assistant/toolDefs'
import { AI_KEY_SETTINGS_HREF, COUNTER_FROM_CHARS, DISCLAIMER, MAX_MESSAGE_CHARS, REFUSAL_MESSAGE } from '@/lib/assistant/config'
import Skeleton from '@/components/ui/Skeleton'
import Markdown from './Markdown'
import type { LiveAnswer } from './useAssistantChat'
import { ArrowDownIcon, CheckIcon, CopyIcon, RetryIcon, SendIcon, SparkleIcon, StopIcon } from './icons'

/** My Assistant chat surface (specs/033) — presentational; used by the full page, the slide-over and the dev preview. */

export interface ChatViewProps {
  variant: 'page' | 'panel'
  firstName: string
  messages: UiMessage[]
  live: LiveAnswer | null
  streaming: boolean
  loading: boolean
  error: string | null
  hasKey: boolean
  migrationMissing: boolean
  areas: AssistantArea[]
  preferredArea?: AssistantArea | null
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  /** Rendered in place of the suggestions when no key resolves (the page shows the key card here). */
  keySlot?: ReactNode
  /** Focus the composer when mounted (slide-over). */
  autoFocus?: boolean
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard unavailable — ignore
        }
      }}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-[var(--ink-3)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]"
      aria-label={copied ? 'Copied' : 'Copy answer'}
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function ToolChips({ tools, active }: { tools: LiveAnswer['tools']; active: boolean }) {
  if (!tools.length) return null
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="What I'm checking">
      {tools.map((t, i) => {
        const running = active && i === tools.length - 1
        return (
          <li key={`${t.tool}-${i}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${running ? 'border-[var(--blue-100)] bg-[var(--blue-50)] text-[var(--blue-700)]' : 'border-[var(--rule)] bg-[var(--paper)] text-[var(--ink-3)]'}`}>
            {running
              ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--blue-500)]" aria-hidden="true" />
              : <CheckIcon className="h-3 w-3 text-[var(--mint)]" />}
            {running ? t.label : t.label.replace(/…$/, '')}
          </li>
        )
      })}
    </ul>
  )
}

function UsedLine({ tools }: { tools: string[] }) {
  const areas = usedSummary(tools)
  if (!areas.length) return null
  return (
    <details className="group text-xs text-[var(--ink-4)]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 py-0.5 hover:text-[var(--ink-3)]">
        <span>Used: {areas.join(' · ')}</span>
        <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
      </summary>
      <p className="mt-1 pl-1 text-[var(--ink-3)]">{[...new Set(tools)].join(', ')}</p>
    </details>
  )
}

function AssistantBubble({ m, isLast, onFollowUp, disabled }: { m: UiAssistantMessage; isLast: boolean; onFollowUp: (q: string) => void; disabled: boolean }) {
  return (
    <div className="group/msg flex gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--yellow-soft)] text-[var(--blue-900)]"><SparkleIcon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md border border-[var(--rule)] bg-[var(--paper)] px-3.5 py-2.5 shadow-[var(--shadow-sm)]">
          {m.refused
            ? <p className="text-[14.5px] text-[var(--ink-2)]">{REFUSAL_MESSAGE}</p>
            : m.text ? <Markdown text={m.text} /> : null}
          {m.notice && <p className="mt-2 rounded-md bg-[var(--yellow-soft)] px-2 py-1 text-xs text-[var(--ink-2)]">{m.notice}</p>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {!m.refused && m.text && <CopyButton text={m.text} />}
          <UsedLine tools={m.tools} />
          <time dateTime={m.createdAt} className="text-[11px] text-[var(--ink-4)] opacity-0 transition-opacity group-hover/msg:opacity-100 group-focus-within/msg:opacity-100">{timeLabel(m.createdAt)}</time>
        </div>
        {isLast && m.followUps.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.followUps.map(f => (
              <button key={f} type="button" disabled={disabled} onClick={() => onFollowUp(f)}
                className="min-h-9 rounded-full border border-[var(--blue-100)] bg-[var(--blue-50)] px-3 py-1.5 text-left text-[13px] font-medium text-[var(--blue-700)] hover:border-[var(--blue-500)] disabled:opacity-50">
                {f}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UserBubble({ text, createdAt }: { text: string; createdAt: string }) {
  return (
    <div className="group/msg flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[var(--blue-700)] px-3.5 py-2 text-[14.5px] text-white">{text}</div>
      <time dateTime={createdAt} className="mt-0.5 text-[11px] text-[var(--ink-4)] opacity-0 transition-opacity group-hover/msg:opacity-100">{timeLabel(createdAt)}</time>
    </div>
  )
}

function EmptyState({ firstName, areas, preferredArea, onPick, disabled, compact }: {
  firstName: string; areas: AssistantArea[]; preferredArea: AssistantArea | null; onPick: (q: string) => void; disabled: boolean; compact: boolean
}) {
  const groups = suggestionGroups(areas, preferredArea)
  return (
    <div className={compact ? 'py-2' : 'py-4 md:py-8'}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--yellow)] text-[var(--blue-900)] shadow-[var(--shadow-sm)]"><SparkleIcon className="h-5 w-5" /></span>
      <h2 className="mt-3 font-display text-xl font-bold text-[var(--ink)] md:text-2xl">Hi {firstName} — what would you like to know?</h2>
      <p className="mt-1 text-sm text-[var(--ink-3)]">Ask about your own data in plain words. Try one of these:</p>
      <div className={`mt-4 grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
        {groups.map(g => (
          <section key={g.area} aria-label={g.label} className="rounded-xl border border-[var(--rule)] bg-[var(--paper)] p-3">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-4)]">{g.label}</h3>
            <div className="flex flex-col gap-1.5">
              {g.prompts.map(p => (
                <button key={p} type="button" disabled={disabled} onClick={() => onPick(p)}
                  className="min-h-10 rounded-lg bg-[var(--paper-2)] px-3 py-2 text-left text-[13.5px] text-[var(--ink-2)] hover:bg-[var(--blue-50)] hover:text-[var(--blue-700)] disabled:cursor-not-allowed disabled:opacity-50">
                  {p}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Composer({ disabled, streaming, onSend, onStop, autoFocus, placeholder }: {
  disabled: boolean; streaming: boolean; onSend: (t: string) => void; onStop: () => void; autoFocus?: boolean; placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  useEffect(() => {
    if (autoFocus && !disabled) ref.current?.focus()
  }, [autoFocus, disabled])

  const submit = () => {
    const t = draft.trim()
    if (!t || disabled || streaming || t.length > MAX_MESSAGE_CHARS) return
    onSend(t)
    setDraft('')
  }
  const over = draft.length > MAX_MESSAGE_CHARS

  return (
    <form
      onSubmit={e => { e.preventDefault(); submit() }}
      className="flex items-end gap-2 rounded-2xl border border-[var(--rule)] bg-[var(--paper)] p-1.5 pl-3 shadow-[var(--shadow-sm)] focus-within:border-[var(--blue-500)]"
    >
      <label className="sr-only" htmlFor="assistant-composer">Ask My Assistant</label>
      <textarea
        id="assistant-composer"
        ref={ref}
        rows={1}
        value={draft}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        placeholder={placeholder}
        className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none disabled:cursor-not-allowed"
      />
      <div className="flex flex-col items-end gap-1">
        {draft.length >= COUNTER_FROM_CHARS && (
          <span className={`text-[11px] tabular-nums ${over ? 'font-semibold text-[var(--coral)]' : 'text-[var(--ink-4)]'}`} aria-live="polite">
            {draft.length}/{MAX_MESSAGE_CHARS}
          </span>
        )}
        {streaming ? (
          <button type="button" onClick={onStop} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--ink)] px-3 text-sm font-semibold text-white hover:bg-[var(--ink-2)]">
            <StopIcon className="h-3.5 w-3.5" /> Stop
          </button>
        ) : (
          <button type="submit" disabled={disabled || !draft.trim() || over} aria-label="Send"
            className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--blue-700)] text-white hover:bg-[var(--blue-900)] disabled:cursor-not-allowed disabled:bg-[var(--paper-3)] disabled:text-[var(--ink-4)]">
            <SendIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  )
}

export default function ChatView(p: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const compact = p.variant === 'panel'
  const blocked = !p.hasKey || p.migrationMissing
  const lastAssistant = [...p.messages].reverse().find(m => m.role === 'assistant')?.id

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }, [])

  const jump = useCallback((smooth = true) => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // Follow the stream while the reader is at the bottom; otherwise offer "Jump to latest".
  const hasThread = p.messages.length > 0 || !!p.live
  useEffect(() => {
    if (atBottom && hasThread) jump(false)
  }, [p.messages, p.live, atBottom, hasThread, jump])

  const liveBody = p.live ? splitFollowUps(p.live.text).body : ''
  const empty = !p.loading && p.messages.length === 0 && !p.live

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'px-4' : 'px-4 md:px-8'}`}
        aria-live="polite"
        aria-busy={p.streaming}
        aria-relevant="additions text"
      >
        <div className={`mx-auto flex w-full flex-col gap-4 py-4 ${compact ? '' : 'max-w-[760px]'}`}>
          {p.loading && (
            <div className="space-y-4" aria-label="Loading conversation">
              <Skeleton className="ml-auto h-9 w-2/3 rounded-2xl" />
              <Skeleton className="h-24 w-5/6 rounded-2xl" />
              <Skeleton className="ml-auto h-9 w-1/2 rounded-2xl" />
            </div>
          )}

          {empty && (blocked && p.keySlot && !p.hasKey ? (
            <div className="py-4">
              <h2 className="font-display text-xl font-bold text-[var(--ink)]">Add your Anthropic key to start</h2>
              <p className="mt-1 text-sm text-[var(--ink-3)]">My Assistant runs Claude with your own API key — you pay Anthropic directly, usually a few cents per question.</p>
              <div className="mt-4">{p.keySlot}</div>
            </div>
          ) : (
            <EmptyState firstName={p.firstName} areas={p.areas} preferredArea={p.preferredArea ?? null} onPick={p.onSend} disabled={blocked || p.streaming} compact={compact} />
          ))}

          {p.messages.map(m => (m.role === 'user'
            ? <UserBubble key={m.id} text={m.text} createdAt={m.createdAt} />
            : <AssistantBubble key={m.id} m={m} isLast={m.id === lastAssistant && !p.live} onFollowUp={p.onSend} disabled={blocked || p.streaming} />
          ))}

          {p.live && (
            <div className="flex gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--yellow-soft)] text-[var(--blue-900)]"><SparkleIcon className="h-3.5 w-3.5 animate-pulse" /></span>
              <div className="min-w-0 flex-1">
                <ToolChips tools={p.live.tools} active={!liveBody} />
                <div className="rounded-2xl rounded-tl-md border border-[var(--rule)] bg-[var(--paper)] px-3.5 py-2.5 shadow-[var(--shadow-sm)]">
                  {liveBody
                    ? <Markdown text={liveBody} />
                    : (
                      <span className="inline-flex items-center gap-1 py-1" aria-label="Thinking">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--ink-4)]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--ink-4)] [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--ink-4)] [animation-delay:240ms]" />
                      </span>
                    )}
                </div>
              </div>
            </div>
          )}

          {p.error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--coral-soft)] bg-[#fff6f4] px-3 py-2 text-sm text-[var(--ink-2)]">
              <span>{p.error}</span>
              {!blocked && (
                <button type="button" onClick={p.onRetry} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--paper)] px-2.5 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--rule)] hover:bg-[var(--paper-2)]">
                  <RetryIcon className="h-3.5 w-3.5" /> Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!atBottom && hasThread && (
        <button type="button" onClick={() => jump()} className="absolute bottom-[112px] left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-white shadow-[var(--shadow)]">
          <ArrowDownIcon className="h-3.5 w-3.5" /> Jump to latest
        </button>
      )}

      <div className={`border-t border-[var(--rule-soft)] bg-[var(--paper-2)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 ${compact ? 'px-3' : 'px-4 md:px-8'}`}>
        <div className={`mx-auto w-full ${compact ? '' : 'max-w-[760px]'}`}>
          {p.migrationMissing && (
            <p className="mb-2 rounded-lg bg-[var(--yellow-soft)] px-3 py-2 text-xs text-[var(--ink-2)]">My Assistant needs a database update — the owner must apply <code>supabase/apply_my_assistant.sql</code>.</p>
          )}
          {!p.hasKey && !p.keySlot && (
            <p className="mb-2 rounded-lg bg-[var(--yellow-soft)] px-3 py-2 text-xs text-[var(--ink-2)]">
              Add your Anthropic API key to use My Assistant. <Link href={AI_KEY_SETTINGS_HREF} className="font-semibold text-[var(--blue-700)] underline">Add key</Link>
            </p>
          )}
          <Composer
            disabled={blocked}
            streaming={p.streaming}
            onSend={p.onSend}
            onStop={p.onStop}
            autoFocus={p.autoFocus}
            placeholder={blocked ? 'Add your key to start…' : 'Ask about your trips, spending, lifestyle or portfolio…'}
          />
          <p className="mt-1.5 text-center text-[11px] text-[var(--ink-4)]">{DISCLAIMER}</p>
        </div>
      </div>
    </div>
  )
}
