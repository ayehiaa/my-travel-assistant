import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { pdfSafeText, type ClinicianReport } from './clinicianExport'

/**
 * Clinician report → PDF (A4, standard Helvetica — no font files, no network). pdf-lib 1.17.1 (pinned, pure JS).
 * Layout: title, profile, weight trend chart + table, waist, lipid panels, adherence, training, cardio, notes,
 * optional progress photos (embedded JPEGs). Photo bytes are passed in by the caller (already signed-URL fetched).
 */

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48
const INK = rgb(0.1, 0.12, 0.16)
const MUTED = rgb(0.4, 0.43, 0.48)
const RULE = rgb(0.85, 0.87, 0.9)
const BLUE = rgb(0.11, 0.3, 0.6)

class Writer {
  page!: PDFPage
  y = 0
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont) { this.newPage() }

  newPage() {
    this.page = this.doc.addPage(A4)
    this.y = A4[1] - MARGIN
  }

  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage()
  }

  /** Word-wrapped text. */
  text(raw: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10
    const font = opts.bold ? this.bold : this.font
    const x = MARGIN + (opts.indent ?? 0)
    const width = A4[0] - MARGIN - x
    for (const para of pdfSafeText(raw).split('\n')) {
      const words = para.split(' ')
      let lineText = ''
      const flush = () => {
        this.ensure(size + 4)
        this.page.drawText(lineText, { x, y: this.y - size, size, font, color: opts.color ?? INK })
        this.y -= size + 4
        lineText = ''
      }
      for (const w of words) {
        const next = lineText ? `${lineText} ${w}` : w
        if (font.widthOfTextAtSize(next, size) > width && lineText) { flush(); lineText = w } else lineText = next
      }
      flush()
    }
    this.y -= opts.gap ?? 0
  }

  heading(t: string) {
    this.ensure(40)
    this.y -= 8
    this.text(t, { size: 13, bold: true, color: BLUE })
    this.page.drawLine({ start: { x: MARGIN, y: this.y + 2 }, end: { x: A4[0] - MARGIN, y: this.y + 2 }, thickness: 0.5, color: RULE })
    this.y -= 6
  }

  /** Simple table: fixed column widths (fractions of the content width), header row in bold. */
  table(headers: string[], rows: Array<Array<string | number | null>>, fractions: number[]) {
    const width = A4[0] - 2 * MARGIN
    const size = 9
    const drawRow = (cells: Array<string | number | null>, isHeader: boolean) => {
      this.ensure(size + 6)
      let x = MARGIN
      cells.forEach((c, i) => {
        const w = fractions[i] * width
        let s = pdfSafeText(c === null || c === undefined ? '—' : String(c))
        const font = isHeader ? this.bold : this.font
        while (s.length > 1 && font.widthOfTextAtSize(s, size) > w - 4) s = s.slice(0, -2) + '…'
        this.page.drawText(s, { x, y: this.y - size, size, font, color: isHeader ? MUTED : INK })
        x += w
      })
      this.y -= size + 5
    }
    drawRow(headers, true)
    for (const r of rows) drawRow(r, false)
    this.y -= 4
  }

  /** Line chart of daily weights (dots) and 7-day averages (line). */
  chart(points: Array<{ date: string; weightKg: number; avg7: number | null }>) {
    if (points.length < 2) return
    const h = 140
    const w = A4[0] - 2 * MARGIN
    this.ensure(h + 24)
    const top = this.y
    const bottom = top - h
    const vals = points.flatMap(p => [p.weightKg, p.avg7 ?? p.weightKg])
    const min = Math.floor(Math.min(...vals) - 0.5)
    const max = Math.ceil(Math.max(...vals) + 0.5)
    const t0 = Date.parse(`${points[0].date}T00:00:00Z`)
    const t1 = Math.max(t0 + 86_400_000, Date.parse(`${points[points.length - 1].date}T00:00:00Z`))
    const px = (d: string) => MARGIN + 30 + ((Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0)) * (w - 40)
    const py = (v: number) => bottom + ((v - min) / (max - min)) * h
    this.page.drawRectangle({ x: MARGIN + 30, y: bottom, width: w - 30, height: h, borderColor: RULE, borderWidth: 0.5 })
    for (const v of [min, (min + max) / 2, max]) {
      this.page.drawText(pdfSafeText(String(Math.round(v * 10) / 10)), { x: MARGIN, y: py(v) - 3, size: 7, font: this.font, color: MUTED })
    }
    for (const p of points) this.page.drawCircle({ x: px(p.date), y: py(p.weightKg), size: 1.6, color: MUTED })
    const avg = points.filter(p => p.avg7 !== null)
    for (let i = 1; i < avg.length; i++) {
      this.page.drawLine({ start: { x: px(avg[i - 1].date), y: py(avg[i - 1].avg7!) }, end: { x: px(avg[i].date), y: py(avg[i].avg7!) }, thickness: 1.5, color: BLUE })
    }
    this.page.drawText(pdfSafeText(`${points[0].date}  ->  ${points[points.length - 1].date}   (dots: daily weight; line: 7-day average, kg)`), { x: MARGIN + 30, y: bottom - 12, size: 7, font: this.font, color: MUTED })
    this.y = bottom - 22
  }
}

const fmt = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`)

export async function renderClinicianPdf(r: ClinicianReport, photos: Array<{ date: string; jpeg: Uint8Array }> = []): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(pdfSafeText(r.title))
  doc.setCreator('Sojourn Health')
  doc.setProducer('Sojourn Health')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc, font, bold)

  w.text(r.title, { size: 18, bold: true })
  w.text(`${r.range.from} to ${r.range.to} (${r.range.days} days) · generated ${r.generatedOn}`, { color: MUTED, gap: 2 })
  w.text('Self-recorded data from a personal health diary. Food values are estimates (±15%). Not a medical record.', { size: 8, color: MUTED, gap: 4 })

  w.heading('Profile')
  for (const p of r.profile) w.text(p)

  w.heading('Weight')
  if (r.weight.rows.length === 0) w.text('No weigh-ins in this period.', { color: MUTED })
  else {
    w.text(`7-day average: ${fmt(r.weight.firstAvg, ' kg')} -> ${fmt(r.weight.lastAvg, ' kg')} (change ${fmt(r.weight.changeKg, ' kg')}). ${r.weight.rows.length} weigh-ins.`)
    w.chart(r.weight.rows)
    const rows = r.weight.rows.length > 60 ? r.weight.rows.filter((_, i) => i % Math.ceil(r.weight.rows.length / 60) === 0 || i === r.weight.rows.length - 1) : r.weight.rows
    w.table(['Date', 'Weight (kg)', '7-day avg (kg)'], rows.map(x => [x.date, x.weightKg, x.avg7]), [0.34, 0.33, 0.33])
    if (rows.length < r.weight.rows.length) w.text('Table thinned to ~60 rows; the CSV has every weigh-in.', { size: 8, color: MUTED })
  }

  w.heading('Waist')
  if (r.waist.rows.length === 0) w.text('No waist measurements in this period.', { color: MUTED })
  else {
    if (r.waist.changeCm !== null) w.text(`Change over the period: ${r.waist.changeCm} cm.`)
    w.table(['Date', 'Waist (cm)'], r.waist.rows.map(x => [x.date, x.cm]), [0.5, 0.5])
  }

  w.heading('Lipid panels (mmol/L)')
  if (r.labs.length === 0) w.text('No lipid panels in this period.', { color: MUTED })
  else w.table(['Date', 'Total', 'LDL', 'HDL', 'Non-HDL', 'TG'], r.labs.map(l => [l.date, l.total, l.ldl, l.hdl, l.nonHdl, l.tg]), [0.25, 0.15, 0.15, 0.15, 0.15, 0.15])

  const a = r.adherence
  w.heading('Nutrition adherence')
  w.text(`Food logged on ${a.daysLogged} of ${a.days} days. Averages on logged days: ${fmt(a.avgKcal, ' kcal')}, protein ${fmt(a.avgProteinG, ' g')}, saturated fat ${fmt(a.avgSatFatG, ' g')}.`)
  w.text(`Protein >= ${a.proteinTarget} g on ${a.proteinDays} days · saturated fat <= ${a.satFatTarget} g on ${a.satFatTargetDays} days (<= ${a.satFatCeiling} g ceiling on ${a.satFatCeilingDays}).`)
  for (const c of a.components) w.text(`• ${c.name}: ${c.summary}`, { indent: 8 })

  w.heading('Training')
  w.text(`Sessions: ${r.training.done} done, ${r.training.partial} partial, ${r.training.skipped} skipped.`)
  if (r.training.keyLifts.length) w.table(['Exercise', 'First top set', 'Latest top set', 'Sessions', 'Change'], r.training.keyLifts.map(k => [k.name, k.first, k.last, k.sessions, k.changePct === null ? null : `${k.changePct}%`]), [0.28, 0.25, 0.25, 0.1, 0.12])

  w.heading('Cardio')
  w.text(`${r.cardio.minutes} minutes in ${r.cardio.sessions} sessions${r.cardio.perWeek !== null ? ` (~${r.cardio.perWeek} min/week)` : ''}.`)
  for (const c of r.cardio.byType) w.text(`• ${c.type}: ${c.minutes} min`, { indent: 8 })

  if (r.notes.length) {
    w.heading('Notes')
    for (const n of r.notes.slice(0, 80)) w.text(`${n.date}: ${n.text}`)
  }

  if (photos.length) {
    w.heading('Progress photos')
    for (const p of photos) {
      try {
        const img = await doc.embedJpg(p.jpeg)
        const scale = Math.min(220 / img.width, 280 / img.height, 1)
        const dims = { width: img.width * scale, height: img.height * scale }
        w.ensure(dims.height + 20)
        w.page.drawImage(img, { x: MARGIN, y: w.y - dims.height, ...dims })
        w.page.drawText(p.date, { x: MARGIN + dims.width + 10, y: w.y - 10, size: 9, font, color: MUTED })
        w.y -= dims.height + 12
      } catch {
        // unreadable image: skip it
      }
    }
  }

  return doc.save()
}
