import { describe, it, expect } from 'vitest'
import { hasExif, isJpeg, isPng, stripJpegMetadata } from './exif'

/** Minimal JPEG: SOI, APP0 (JFIF), APP1 (Exif), COM, DQT, SOS + data, EOI. */
function fakeJpeg(): Uint8Array {
  const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload]
  return Uint8Array.from([
    0xff, 0xd8,
    ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00]),
    ...seg(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 1, 2, 3, 4]),
    ...seg(0xfe, [0x68, 0x69]),
    ...seg(0xdb, [9, 9, 9]),
    ...seg(0xda, [1, 2]), 0x11, 0x22, 0xff, 0x00, 0x33,
    0xff, 0xd9,
  ])
}

describe('JPEG metadata stripping', () => {
  it('removes APP1 and COM but keeps the image data', () => {
    const input = fakeJpeg()
    expect(hasExif(input)).toBe(true)
    const out = stripJpegMetadata(input)
    expect(hasExif(out)).toBe(false)
    expect(isJpeg(out)).toBe(true)
    expect(out.length).toBe(input.length - (2 + 12) - (2 + 4))
    expect(Array.from(out.slice(-7))).toEqual([0x11, 0x22, 0xff, 0x00, 0x33, 0xff, 0xd9])
  })

  it('rejects non-JPEG and malformed input', () => {
    expect(() => stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toThrow()
    expect(() => stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toThrow()
    expect(isPng(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toBe(true)
  })
})
