import { notFound } from 'next/navigation'
import { ToastProvider } from '@/context/ToastContext'
import AssistantPreview, { type PreviewView } from './AssistantPreview'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Assistant preview (dev)' }

const VIEWS: readonly PreviewView[] = ['chat', 'empty', 'nokey', 'tools', 'panel']

/**
 * DEV-ONLY visual preview of My Assistant (specs/033) with fixture data: /dev/assistant-preview?view=…
 * (chat | empty | nokey | tools | panel). 404 in production; the middleware lets it through only outside production.
 * Nothing here calls Claude or the database.
 */
export default async function AssistantPreviewPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const params = await searchParams
  const raw = Array.isArray(params.view) ? params.view[0] : params.view
  const view = VIEWS.includes(raw as PreviewView) ? (raw as PreviewView) : 'chat'
  return (
    <ToastProvider>
      <AssistantPreview view={view} />
    </ToastProvider>
  )
}
