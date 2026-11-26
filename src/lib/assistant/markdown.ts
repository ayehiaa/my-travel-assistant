/**
 * My Assistant (specs/033) — a minimal, safe Markdown parser (pure). Produces a small AST that the UI renders as React
 * elements, so raw HTML in an answer is only ever shown as text. Supports headings, paragraphs, bullet / numbered
 * lists, tables, fenced code, block quotes, rules, and inline bold / italic / code / links (sanitised).
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' }

export type Align = 'left' | 'center' | 'right' | null

export type Block =
  | { t: 'h'; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; start: number; items: Inline[][] }
  | { t: 'table'; head: Inline[][]; align: Align[]; rows: Inline[][][] }
  | { t: 'code'; lang: string | null; v: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }

/** Only http(s), mailto and same-site absolute paths are linked; anything else (javascript:, data:, //host) → null. */
export function sanitizeHref(raw: string): string | null {
  const href = raw.trim()
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href
  if (/^mailto:[^\s]+$/i.test(href)) return href
  if (/^\/(?!\/)[^\s]*$/.test(href)) return href
  return null
}

export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

// ── Inline ──────────────────────────────────────────────────────────────────

export function parseInline(src: string): Inline[] {
  const out: Inline[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    // escaped character
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#|<>-]/.test(src[i + 1])) {
      buf += src[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ t: 'code', v: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] === ch) {
      const marker = ch + ch
      const end = src.indexOf(marker, i + 2)
      if (end > i + 2) {
        flush()
        out.push({ t: 'strong', c: parseInline(src.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    if (ch === '*' || (ch === '_' && (i === 0 || /\W/.test(src[i - 1])))) {
      const end = src.indexOf(ch, i + 1)
      if (end > i + 1 && src[i + 1] !== ' ' && (ch === '*' || end + 1 >= src.length || /\W/.test(src[end + 1]))) {
        flush()
        out.push({ t: 'em', c: parseInline(src.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }
    if (ch === '[') {
      const close = src.indexOf('](', i + 1)
      let paren = -1
      if (close > i) {
        // matching ")" (URLs may contain balanced parentheses)
        let depth = 0
        for (let k = close + 2; k < src.length; k++) {
          if (src[k] === '(') depth++
          else if (src[k] === ')') {
            if (depth === 0) { paren = k; break }
            depth--
          }
        }
      }
      if (close > i && paren > close) {
        const label = src.slice(i + 1, close)
        const href = sanitizeHref(src.slice(close + 2, paren))
        flush()
        if (href) out.push({ t: 'link', href, c: parseInline(label) })
        else out.push(...parseInline(label))
        i = paren + 1
        continue
      }
    }
    buf += ch
    i++
  }
  flush()
  return out
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const RE_FENCE = /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/
const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const RE_UL = /^\s*[-*+]\s+(.*)$/
const RE_OL = /^\s*(\d{1,9})[.)]\s+(.*)$/
const RE_QUOTE = /^\s{0,3}>\s?(.*)$/
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue }
    cur += s[i]
  }
  cells.push(cur.trim())
  return cells
}

function alignOf(cell: string): Align {
  const c = cell.trim()
  const left = c.startsWith(':')
  const right = c.endsWith(':')
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null
}

function isBlockStart(line: string, next: string | undefined): boolean {
  return RE_FENCE.test(line) || RE_HEADING.test(line) || RE_HR.test(line) || RE_UL.test(line) || RE_OL.test(line) ||
    RE_QUOTE.test(line) || (line.includes('|') && next !== undefined && RE_TABLE_SEP.test(next))
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const fence = line.match(RE_FENCE)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^\\s{0,3}${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++])
      i++ // closing fence (or end of input while streaming)
      blocks.push({ t: 'code', lang: fence[2] || null, v: body.join('\n') })
      continue
    }

    const heading = line.match(RE_HEADING)
    if (heading) {
      const level = Math.min(4, heading[1].length) as 1 | 2 | 3 | 4
      blocks.push({ t: 'h', level, c: parseInline(heading[2]) })
      i++
      continue
    }

    if (RE_HR.test(line)) { blocks.push({ t: 'hr' }); i++; continue }

    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line)
      const align = splitRow(lines[i + 1]).map(alignOf)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const cells = splitRow(lines[i])
        rows.push(head.map((_, k) => parseInline(cells[k] ?? '')))
        i++
      }
      blocks.push({ t: 'table', head: head.map(parseInline), align: head.map((_, k) => align[k] ?? null), rows })
      continue
    }

    if (RE_UL.test(line) || RE_OL.test(line)) {
      const ordered = !RE_UL.test(line)
      const start = ordered ? Number(line.match(RE_OL)![1]) : 1
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        const m = ordered ? l.match(RE_OL) : l.match(RE_UL)
        if (m) { items.push(ordered ? m[2] : m[1]); i++; continue }
        // A non-blank, indented continuation line belongs to the previous item.
        if (l.trim() && /^\s{2,}/.test(l) && items.length > 0 && !isBlockStart(l.trim(), lines[i + 1])) {
          items[items.length - 1] += ` ${l.trim()}`
          i++
          continue
        }
        if (l.trim() && (RE_UL.test(l) || RE_OL.test(l))) {
          // nested list of the other kind → flatten into this list
          const n = l.match(RE_UL) ?? l.match(RE_OL)
          items.push((n && (n[2] ?? n[1])) || l.trim())
          i++
          continue
        }
        break
      }
      const parsed = items.map(parseInline)
      blocks.push(ordered ? { t: 'ol', start, items: parsed } : { t: 'ul', items: parsed })
      continue
    }

    if (RE_QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && RE_QUOTE.test(lines[i])) body.push(lines[i++].match(RE_QUOTE)![1])
      blocks.push({ t: 'quote', c: parseMarkdown(body.join('\n')) })
      continue
    }

    const para: string[] = [line.trim()]
    i++
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) para.push(lines[i++].trim())
    const c: Inline[] = []
    para.forEach((p, k) => {
      if (k > 0) c.push({ t: 'br' })
      c.push(...parseInline(p))
    })
    blocks.push({ t: 'p', c })
  }
  return blocks
}

/** Plain text of inline nodes (copy button, previews). */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes.map(n => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? '\n' : inlineText(n.c))).join('')
}
