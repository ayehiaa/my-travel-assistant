'use client'

import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { itemFromBarcodeProduct, parseBarcode, type PortionOption } from '@/lib/health/barcode'
import type { FoodItem } from '@/lib/health/nutrition'
import type { OffProduct } from '@/lib/health/openFoodFacts'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT } from './ui'

/**
 * Barcode scanning (phase P3): the camera via the browser's BarcodeDetector API where available (Chrome / Edge on
 * Android, recent Safari); elsewhere — or if the camera is refused — type the number printed under the bars. No extra
 * library is bundled. Product → Open Food Facts (server, cached) → portion → a logged item (label values per 100 g
 * scaled); the item is ticked "Remember" so saving the entry also saves it to your foods.
 */

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

function detectorCtor(): BarcodeDetectorCtor | null {
  const w = globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
  return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : null
}

export default function BarcodeScanner({ onAdd, onClose }: { onAdd: (item: FoodItem) => void; onClose: () => void }) {
  const toast = useToast()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [looking, setLooking] = useState(false)
  const [product, setProduct] = useState<OffProduct | null>(null)
  const [portions, setPortions] = useState<PortionOption[]>([])
  const [grams, setGrams] = useState('')
  const supported = typeof window !== 'undefined' && detectorCtor() !== null && !!navigator.mediaDevices?.getUserMedia

  async function lookup(raw: string) {
    const code = parseBarcode(raw)
    if (!code) { toast('That is not a valid barcode — check the digits', 'error'); return }
    setLooking(true)
    try {
      const res = await fetch(`/api/health/foods/barcode?code=${code}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast(data.error ?? 'Lookup failed', 'error'); return }
      setProduct(data.product as OffProduct)
      setPortions((data.portions as PortionOption[]) ?? [])
      setGrams(String((data.portions as PortionOption[])?.[0]?.grams ?? 100))
    } catch {
      toast('Network error — enter the food by hand', 'error')
    } finally {
      setLooking(false)
    }
  }

  useEffect(() => {
    if (!scanning) return
    const Ctor = detectorCtor()
    if (!Ctor) return
    let stream: MediaStream | null = null
    let timer: number | null = null
    let stopped = false
    const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        timer = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return
          try {
            const codes = await detector.detect(videoRef.current)
            const hit = codes.map(c => parseBarcode(c.rawValue)).find((c): c is string => !!c)
            if (hit && !stopped) {
              stopped = true
              setScanning(false)
              try { navigator.vibrate?.(80) } catch { /* not supported */ }
              void lookup(hit)
            }
          } catch {
            // frame not ready
          }
        }, 300)
      } catch {
        setCameraError('Camera not available — type the barcode number instead.')
        setScanning(false)
      }
    })()
    return () => {
      stopped = true
      if (timer !== null) window.clearInterval(timer)
      stream?.getTracks().forEach(t => t.stop())
    }
    // lookup is stable for this component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  function add() {
    const g = Number(grams.replace(',', '.'))
    if (!product || !Number.isFinite(g) || g <= 0) { toast('Enter the grams you had', 'error'); return }
    onAdd(itemFromBarcodeProduct(product, g))
    toast(`${product.name} added`, 'success')
    onClose()
  }

  return (
    <div className="rounded-lg border border-[var(--rule)] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--ink)]">Scan barcode</p>
        <button type="button" className="text-sm underline" onClick={onClose}>Close</button>
      </div>

      {!product && (
        <>
          {supported && !scanning && !cameraError && (
            <button type="button" className={BUTTON_PRIMARY} onClick={() => setScanning(true)}>Open camera</button>
          )}
          {scanning && (
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="block h-56 w-full object-cover" muted playsInline />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
              <button type="button" className="absolute bottom-2 right-2 rounded-full bg-white px-3 py-1 text-xs font-semibold" onClick={() => setScanning(false)}>Stop</button>
            </div>
          )}
          {(!supported || cameraError) && (
            <p className="mb-2 text-xs text-[var(--ink-3)]">{cameraError ?? 'This browser cannot scan barcodes with the camera — type the number under the bars.'}</p>
          )}
          <div className="mt-2 flex gap-2">
            <input aria-label="Barcode number" className={`${INPUT} min-w-0 flex-1`} inputMode="numeric" placeholder="e.g. 5000108030447" value={manual}
              onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void lookup(manual) } }} />
            <button type="button" className={BUTTON_SECONDARY} disabled={looking || manual.trim().length < 8} onClick={() => lookup(manual)}>{looking ? '…' : 'Look up'}</button>
          </div>
          {looking && <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-[var(--rule)]" aria-hidden="true" />}
        </>
      )}

      {product && (
        <div className="flex flex-col gap-2">
          <p className="text-sm"><strong className="text-[var(--ink)]">{product.name}</strong>{product.brand ? ` · ${product.brand}` : ''}</p>
          <p className="text-xs text-[var(--ink-3)]">Per 100 g: {product.per100.kcal} kcal · protein {product.per100.proteinG} g · sat fat {product.per100.satFatG} g · fibre {product.per100.fibreG} g</p>
          <div className="flex flex-wrap gap-1.5">
            {portions.map(p => (
              <button key={p.label} type="button" onClick={() => setGrams(String(p.grams))}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${String(p.grams) === grams ? 'border-[var(--blue-700)] bg-blue-50 text-[var(--blue-700)]' : 'border-[var(--rule)]'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <input aria-label="Grams" className={`${INPUT} w-24`} inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} /> g
          </label>
          <div className="flex gap-2">
            <button type="button" className={BUTTON_PRIMARY} onClick={add}>Add</button>
            <button type="button" className={BUTTON_SECONDARY} onClick={() => { setProduct(null); setManual('') }}>Scan another</button>
          </div>
        </div>
      )}
    </div>
  )
}
