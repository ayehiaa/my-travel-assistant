import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCheckins, loadEntries, nowFor, requireEnrolment, requireHealthUser, weighInsOf } from '@/lib/health/healthServer'
import { loadCardio, loadLabs, loadProgressPhotos, loadWaist } from '@/lib/health/p2Server'
import { loadExerciseHistory, loadWorkouts } from '@/lib/health/trainingServer'
import { ClinicianExportQuerySchema, assembleClinicianReport, exportFileName, reportToCsv, csvCell } from '@/lib/health/clinicianExport'
import { renderClinicianPdf } from '@/lib/health/clinicianPdf'
import { HEALTH_PHOTO_BUCKET } from '@/lib/health/healthPhotos'
import { addDays } from '@/lib/health/time'
import { auditHealth } from '@/lib/health/p3Server'

/**
 * Clinician export (specs/029 US14): date range → PDF (pdf-lib, server-side) or CSV. Profile summary, weight + 7-day
 * averages, waist, lipid panels, adherence, training, cardio, notes. Progress photos only when photos=1 (embedded in
 * the PDF; 24-hour signed links in the CSV). Each section degrades to empty when its phase's tables are missing.
 */

export const maxDuration = 60
const MAX_PHOTOS = 12

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p } catch { return fallback }
}

export async function GET(request: NextRequest) {
  const auth = await requireHealthUser()
  if (!auth.ok) return auth.response
  const { user } = auth
  const sp = request.nextUrl.searchParams
  const parsed = ClinicianExportQuerySchema.safeParse({
    from: sp.get('from') ?? '', to: sp.get('to') ?? '', format: sp.get('format') ?? undefined, photos: sp.get('photos') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid range' }, { status: 400 })
  const q = parsed.data

  const supabase = await createClient()
  const enrol = await requireEnrolment(supabase, user.id)
  if (!enrol.ok) return enrol.response
  const { enrolment } = enrol
  const { def } = enrolment
  const exerciseKeys = [...new Set(def.trainingSessions.flatMap(s => s.exercises.map(e => e.key)))]

  const [checkins, entries, waist, labs, cardio, workouts, history, logs, photoRows] = await Promise.all([
    safe(loadCheckins(supabase, user.id, addDays(q.from, -6), q.to), []),
    safe(loadEntries(supabase, user.id, q.from, q.to), []),
    safe(loadWaist(supabase, user.id), []),
    safe(loadLabs(supabase, user.id), []),
    safe(loadCardio(supabase, user.id, q.from, q.to), []),
    safe(loadWorkouts(supabase, user.id, q.from, q.to), []),
    safe(loadExerciseHistory(supabase, user.id, exerciseKeys, { limitRows: 5000 }), {}),
    safe(Promise.resolve(supabase.from('health_daily_logs').select('local_date, notes').eq('user_id', user.id).gte('local_date', q.from).lte('local_date', q.to).not('notes', 'is', null)).then(r => r.data ?? []), []),
    q.photos ? safe(loadProgressPhotos(supabase, user.id), []) : Promise.resolve([]),
  ])

  const photosInRange = photoRows.filter(p => p.date >= q.from && p.date <= q.to && p.path.startsWith(`progress/${user.id}/`)).slice(0, MAX_PHOTOS)
  const notes = [
    ...logs.map(l => ({ date: String(l.local_date), text: String(l.notes ?? '') })),
    ...workouts.filter(w => w.notes).map(w => ({ date: w.date, text: `${def.trainingSessions.find(s => s.key === w.sessionKey)?.name ?? w.sessionKey}: ${w.notes}` })),
  ]

  const report = assembleClinicianReport({
    from: q.from,
    to: q.to,
    generatedOn: nowFor(enrolment).date,
    programmeName: enrolment.programmeName,
    startDate: enrolment.startDate,
    def,
    profile: enrolment.profile,
    targets: enrolment.targets,
    weighIns: weighInsOf(checkins),
    waist,
    labs,
    food: entries.reduce<Array<{ date: string; items: typeof entries[number]['items'] }>>((acc, e) => {
      const day = acc.find(d => d.date === e.date)
      if (day) day.items.push(...e.items)
      else acc.push({ date: e.date, items: [...e.items] })
      return acc
    }, []),
    workouts: workouts.map(w => ({ date: w.date, sessionKey: w.sessionKey, status: w.status, notes: w.notes })),
    exerciseSets: Object.entries(history).flatMap(([exerciseKey, list]) => list.map(h => ({ date: h.date, exerciseKey, sets: h.sets }))),
    cardio,
    notes,
  })

  await auditHealth(user.id, 'health_data_exported', { export: { before: null, after: `clinician ${q.format}${q.photos ? ' with photos' : ''}` } })

  const admin = createAdminClient()
  if (q.format === 'csv') {
    let csv = reportToCsv(report)
    if (photosInRange.length) {
      const { data } = await admin.storage.from(HEALTH_PHOTO_BUCKET).createSignedUrls(photosInRange.map(p => p.path), 24 * 3600).catch(() => ({ data: null }))
      const urls = new Map((data ?? []).filter(d => d.path && d.signedUrl).map(d => [d.path as string, d.signedUrl]))
      csv += `\r\nphoto,date,link_valid_24h\r\n` + photosInRange.map(p => ['photo', p.date, urls.get(p.path) ?? ''].map(csvCell).join(',')).join('\r\n') + '\r\n'
    }
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFileName(report, 'csv')}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const photos: Array<{ date: string; jpeg: Uint8Array }> = []
  for (const p of photosInRange) {
    try {
      const { data } = await admin.storage.from(HEALTH_PHOTO_BUCKET).download(p.path)
      if (data) photos.push({ date: p.date, jpeg: new Uint8Array(await data.arrayBuffer()) })
    } catch {
      // skip unreadable photo
    }
  }
  const pdf = await renderClinicianPdf(report, photos)
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${exportFileName(report, 'pdf')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
