'use client'

import { useState } from 'react'
import { useToast } from '@/context/ToastContext'

type Props = {
  initialDate: string | null
}

export default function ReferenceDateSettings({ initialDate }: Props) {
  const [value, setValue] = useState(initialDate ?? '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/reference-date', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceDate: value || null }),
      })
      if (!res.ok) throw new Error()
      toast('Reference date saved', 'success')
    } catch {
      toast('Failed to save reference date', 'error')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = value !== (initialDate ?? '')

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reference date
        </label>
        <input
          type="date"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
