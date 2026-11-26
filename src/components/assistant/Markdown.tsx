import Link from 'next/link'
import { Fragment, useMemo } from 'react'
import { isExternalHref, parseMarkdown, type Align, type Block, type Inline } from '@/lib/assistant/markdown'

/**
 * Safe Markdown for assistant answers (specs/033): the parser returns an AST and this renders React elements only —
 * no dangerouslySetInnerHTML, so HTML in an answer is shown as text. Links are sanitised by the parser.
 */

function Inlines({ nodes }: { nodes: readonly Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text': return <Fragment key={i}>{n.v}</Fragment>
          case 'br': return <br key={i} />
          case 'code': return <code key={i} className="rounded bg-[var(--paper-3)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--ink)]">{n.v}</code>
          case 'strong': return <strong key={i} className="font-semibold text-[var(--ink)]"><Inlines nodes={n.c} /></strong>
          case 'em': return <em key={i}><Inlines nodes={n.c} /></em>
          case 'link':
            return isExternalHref(n.href)
              ? <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-[var(--blue-700)] underline underline-offset-2"><Inlines nodes={n.c} /></a>
              : <Link key={i} href={n.href} className="font-medium text-[var(--blue-700)] underline underline-offset-2"><Inlines nodes={n.c} /></Link>
        }
      })}
    </>
  )
}

const ALIGN: Record<NonNullable<Align>, string> = { left: 'text-left', center: 'text-center', right: 'text-right' }

function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h': {
            const cls = b.level <= 2 ? 'mt-3 text-base font-bold' : 'mt-2 text-[15px] font-semibold'
            return <p key={i} role="heading" aria-level={b.level + 2} className={`${cls} font-display text-[var(--ink)] first:mt-0`}><Inlines nodes={b.c} /></p>
          }
          case 'p': return <p key={i} className="my-2 first:mt-0 last:mb-0"><Inlines nodes={b.c} /></p>
          case 'ul':
            return (
              <ul key={i} className="my-2 list-disc space-y-1 pl-5 marker:text-[var(--ink-4)]">
                {b.items.map((it, k) => <li key={k}><Inlines nodes={it} /></li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={i} start={b.start} className="my-2 list-decimal space-y-1 pl-5 marker:text-[var(--ink-4)]">
                {b.items.map((it, k) => <li key={k}><Inlines nodes={it} /></li>)}
              </ol>
            )
          case 'table':
            return (
              <div key={i} className="my-2 max-w-full overflow-x-auto rounded-lg border border-[var(--rule)]">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="bg-[var(--paper-2)]">
                    <tr>
                      {b.head.map((h, k) => (
                        <th key={k} scope="col" className={`whitespace-nowrap border-b border-[var(--rule)] px-2.5 py-1.5 font-semibold text-[var(--ink-2)] ${ALIGN[b.align[k] ?? 'left']}`}>
                          <Inlines nodes={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b border-[var(--rule-soft)] last:border-0">
                        {row.map((c, k) => (
                          <td key={k} className={`px-2.5 py-1.5 align-top tabular-nums ${ALIGN[b.align[k] ?? 'left']}`}><Inlines nodes={c} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'code':
            return (
              <pre key={i} className="my-2 max-w-full overflow-x-auto rounded-lg bg-[var(--paper-3)] p-3 font-mono text-[12.5px] leading-relaxed text-[var(--ink)]">
                <code>{b.v}</code>
              </pre>
            )
          case 'quote':
            return <blockquote key={i} className="my-2 border-l-4 border-[var(--rule)] pl-3 text-[var(--ink-3)]"><Blocks blocks={b.c} /></blockquote>
          case 'hr':
            return <hr key={i} className="my-3 border-[var(--rule)]" />
        }
      })}
    </>
  )
}

export default function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text])
  return <div className="break-words text-[14.5px] leading-relaxed text-[var(--ink-2)]"><Blocks blocks={blocks} /></div>
}
