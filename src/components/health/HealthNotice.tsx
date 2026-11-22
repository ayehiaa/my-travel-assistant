import { CARD } from './ui'

/** Friendly full-width state card (database update needed, invalid programme, load error). */
export default function HealthNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${CARD} border-amber-200 bg-amber-50`}>
      <h2 className="mb-1 text-base font-bold text-amber-900">{title}</h2>
      <div className="text-sm text-amber-900">{children}</div>
    </div>
  )
}
