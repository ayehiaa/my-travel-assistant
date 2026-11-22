import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { isJpeg, isPng, isWebp, stripJpegMetadata } from './exif'
import { PHOTO_PATH_RE } from './nutrition'

/**
 * Server only. Food photos (specs/029 §8): private bucket `health-photos`, path `<userId>/<date>/<uuid>.jpg`,
 * metadata (EXIF incl. GPS) stripped before storage, signed URLs only. The bucket has no client policies; every
 * access goes through the service role after the API has checked ownership via the path prefix.
 */

export const HEALTH_PHOTO_BUCKET = 'health-photos'
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
const MAX_EDGE_PX = 1568
const SIGNED_URL_SECONDS = 60 * 60

/** Re-encode to a metadata-free JPEG (sharp), or strip JPEG metadata segments when sharp is unavailable. */
export async function sanitizePhoto(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isJpeg(bytes) && !isPng(bytes) && !isWebp(bytes)) throw new Error('Only JPEG, PNG or WebP photos are supported')
  try {
    const sharp = (await import('sharp')).default
    // rotate() applies the EXIF orientation; the output carries no metadata unless withMetadata() is called.
    const out = await sharp(bytes, { failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    return new Uint8Array(out)
  } catch (err) {
    if (isJpeg(bytes)) return stripJpegMetadata(bytes)
    throw err instanceof Error ? err : new Error('Could not process the photo')
  }
}

export function photoPath(userId: string, date: string): string {
  return `${userId}/${date}/${randomUUID()}.jpg`
}

/** A path belongs to this user and has our shape. */
export function isOwnPhotoPath(path: string, userId: string): boolean {
  return PHOTO_PATH_RE.test(path) && path.startsWith(`${userId}/`)
}

export async function uploadPhoto(path: string, jpeg: Uint8Array): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await createAdminClient().storage
    .from(HEALTH_PHOTO_BUCKET)
    .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
  if (error) {
    const missing = /bucket not found|not found/i.test(error.message)
    return { ok: false, reason: missing ? 'The health-photos storage bucket is missing — apply supabase/apply_health_p1a.sql' : 'Photo upload failed' }
  }
  return { ok: true }
}

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  try {
    const { data } = await createAdminClient().storage.from(HEALTH_PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
    const out: Record<string, string> = {}
    for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
    return out
  } catch {
    return {}
  }
}

/** Best effort: removing a photo never fails the request that deletes its entry. */
export async function removePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await createAdminClient().storage.from(HEALTH_PHOTO_BUCKET).remove(paths)
  } catch {
    // ignore
  }
}

/**
 * Stored photos as base64 JPEG (re-calculation of a saved entry sends its existing photos to the model again).
 * Only the caller's own paths; unreadable photos are skipped.
 */
export async function downloadPhotosBase64(paths: string[], userId: string): Promise<string[]> {
  const out: string[] = []
  for (const path of paths) {
    if (!isOwnPhotoPath(path, userId)) continue
    try {
      const { data, error } = await createAdminClient().storage.from(HEALTH_PHOTO_BUCKET).download(path)
      if (error || !data) continue
      out.push(Buffer.from(await data.arrayBuffer()).toString('base64'))
    } catch {
      // skip
    }
  }
  return out
}
