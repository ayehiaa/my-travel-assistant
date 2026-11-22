/**
 * Pure JPEG metadata stripper (specs/029 §8: EXIF location stripped on upload). Fallback for when `sharp`
 * (which re-encodes and drops all metadata) is unavailable. Removes APP1 (EXIF / XMP — GPS lives here),
 * APP13 (IPTC / Photoshop) and COM segments; keeps everything needed to decode the image.
 */

const STRIP_MARKERS = new Set([0xe1, 0xed, 0xfe])

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

export function isWebp(bytes: Uint8Array): boolean {
  return bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
}

/** JPEG without metadata segments. Throws for anything that is not a well-formed JPEG header section. */
export function stripJpegMetadata(input: Uint8Array): Uint8Array {
  if (!isJpeg(input)) throw new Error('Not a JPEG')
  const chunks: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)]
  const concat = () => {
    const total = chunks.reduce((s, c) => s + c.length, 0)
    const out = new Uint8Array(total)
    let o = 0
    for (const c of chunks) { out.set(c, o); o += c.length }
    return out
  }
  let i = 2
  while (i < input.length) {
    if (input[i] !== 0xff) throw new Error('Malformed JPEG')
    // Skip fill bytes
    while (i < input.length && input[i] === 0xff) i++
    const marker = input[i]
    i++
    if (marker === undefined) throw new Error('Malformed JPEG')
    // Standalone markers (no length)
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(Uint8Array.of(0xff, marker))
      continue
    }
    if (marker === 0xd9) { chunks.push(Uint8Array.of(0xff, 0xd9)); break }
    if (i + 1 >= input.length) throw new Error('Malformed JPEG')
    const len = (input[i] << 8) | input[i + 1]
    if (len < 2 || i + len > input.length) throw new Error('Malformed JPEG')
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded data (+ EOI) — copy as is.
      chunks.push(Uint8Array.of(0xff, marker), input.subarray(i))
      return concat()
    }
    if (!STRIP_MARKERS.has(marker)) {
      chunks.push(Uint8Array.of(0xff, marker), input.subarray(i, i + len))
    }
    i += len
  }
  return concat()
}

/** True when the JPEG header section still contains an EXIF APP1 segment. */
export function hasExif(input: Uint8Array): boolean {
  if (!isJpeg(input)) return false
  let i = 2
  while (i + 4 < input.length && input[i] === 0xff) {
    const marker = input[i + 1]
    if (marker === 0xda || marker === 0xd9) return false
    const len = (input[i + 2] << 8) | input[i + 3]
    if (marker === 0xe1 && input[i + 4] === 0x45 /* 'E' */) return true
    i += 2 + len
  }
  return false
}
