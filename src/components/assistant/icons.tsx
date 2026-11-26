/** Small inline SVG icons for My Assistant (specs/033). Decorative: aria-hidden. */

type P = { className?: string }

export function SparkleIcon({ className = 'h-4 w-4' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5c.4 0 .7.3.8.7l.9 3.6a5 5 0 0 0 3.5 3.5l3.6.9a.8.8 0 0 1 0 1.6l-3.6.9a5 5 0 0 0-3.5 3.5l-.9 3.6a.8.8 0 0 1-1.6 0l-.9-3.6a5 5 0 0 0-3.5-3.5l-3.6-.9a.8.8 0 0 1 0-1.6l3.6-.9a5 5 0 0 0 3.5-3.5l.9-3.6c.1-.4.4-.7.8-.7Z" />
      <path d="M19 1.8c.2 0 .4.1.4.3l.3 1.1c.1.5.5.9 1 1l1.1.3a.4.4 0 0 1 0 .8l-1.1.3c-.5.1-.9.5-1 1l-.3 1.1a.4.4 0 0 1-.8 0l-.3-1.1c-.1-.5-.5-.9-1-1l-1.1-.3a.4.4 0 0 1 0-.8l1.1-.3c.5-.1.9-.5 1-1l.3-1.1c0-.2.2-.3.4-.3Z" opacity=".7" />
    </svg>
  )
}

function Stroke({ className = 'h-4 w-4', d }: P & { d: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export const SendIcon = (p: P) => <Stroke {...p} d="M5 12h13M13 6l6 6-6 6" />
export const StopIcon = (p: P) => <Stroke {...p} d="M7 7h10v10H7z" />
export const CopyIcon = (p: P) => <Stroke {...p} d="M9 9h10v10H9zM5 15V5h10" />
export const CheckIcon = (p: P) => <Stroke {...p} d="M5 12l4 4L19 7" />
export const PlusIcon = (p: P) => <Stroke {...p} d="M12 5v14M5 12h14" />
export const CloseIcon = (p: P) => <Stroke {...p} d="M6 6l12 12M18 6L6 18" />
export const MenuIcon = (p: P) => <Stroke {...p} d="M4 7h16M4 12h16M4 17h16" />
export const TrashIcon = (p: P) => <Stroke {...p} d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
export const PencilIcon = (p: P) => <Stroke {...p} d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
export const ArrowDownIcon = (p: P) => <Stroke {...p} d="M12 5v14M6 13l6 6 6-6" />
export const RetryIcon = (p: P) => <Stroke {...p} d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />
export const ExpandIcon = (p: P) => <Stroke {...p} d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
