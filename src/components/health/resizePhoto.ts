/**
 * Client-side photo preparation: downscale to ≤1568 px and re-encode as JPEG through a canvas. Re-encoding drops
 * all EXIF metadata (incl. GPS) before upload and keeps 4 photos well under the request size limit. The server
 * strips metadata again regardless.
 */
const MAX_EDGE = 1568

export async function preparePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob ?? file
  } catch {
    // e.g. HEIC the browser cannot decode — send as is; the server rejects unsupported formats with a clear message
    return file
  }
}
