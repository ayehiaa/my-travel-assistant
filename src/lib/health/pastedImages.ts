/**
 * Image files from a paste (clipboard) or drop (drag and drop) event — screenshots of orders, receipts, menus,
 * nutrition labels or meal photos. Pure: works on any DataTransfer-like object, so it is unit-testable.
 */
export interface DataTransferLike {
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null
  files?: ArrayLike<File> | null
}

const ACCEPTED = /^image\/(png|jpe?g|webp)$/i

export function imageFilesFrom(dt: DataTransferLike | null | undefined): File[] {
  if (!dt) return []
  const out: File[] = []
  const seen = new Set<File>()
  const items = dt.items ? Array.from(dt.items) : []
  for (const item of items) {
    if (item.kind !== 'file' || !ACCEPTED.test(item.type)) continue
    const f = item.getAsFile()
    if (f && !seen.has(f)) { seen.add(f); out.push(f) }
  }
  // Some browsers expose dropped/pasted files only via .files
  if (out.length === 0 && dt.files) {
    for (const f of Array.from(dt.files)) if (ACCEPTED.test(f.type) && !seen.has(f)) { seen.add(f); out.push(f) }
  }
  return out
}

/** True when the clipboard also carries text, so the default text paste should still happen. */
export function hasTextPayload(dt: { types?: ArrayLike<string> | null } | null | undefined): boolean {
  return !!dt?.types && Array.from(dt.types).some(t => t === 'text/plain')
}
