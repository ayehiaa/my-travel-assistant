'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Assistant {
  id: string
  assistantUserId: string
  displayName: string
  createdAt: string
}

export default function AssistantsManager({ initial }: { initial: Assistant[] }) {
  const router = useRouter()
  const [assistants, setAssistants] = useState<Assistant[]>(initial)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/account-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    setAssistants(prev => [...prev, data])
    setEmail('')
    router.refresh()
  }

  async function handleRemove(linkId: string) {
    setRemovingId(linkId)
    await fetch(`/api/account-links?id=${linkId}`, { method: 'DELETE' })
    setAssistants(prev => prev.filter(a => a.id !== linkId))
    setRemovingId(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        {assistants.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-400">No assistants linked yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assistants.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.displayName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Added {new Date(a.createdAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(a.id)}
                  disabled={removingId === a.id}
                  className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                >
                  {removingId === a.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex items-start gap-3">
        <div className="flex-1">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="assistant@example.com"
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <button
          type="submit"
          disabled={loading || !email}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Adding…' : 'Add assistant'}
        </button>
      </form>
    </div>
  )
}
