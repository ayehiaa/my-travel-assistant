import { formatRunCost, type AiRunUsage } from '@/lib/aiCost'

interface Props {
  usage: AiRunUsage | null
}

/** Small "Run cost" line for an analysis run. Renders nothing for runs recorded before usage logging. */
export default function RunCostLine({ usage }: Props) {
  if (!usage) return null
  const calls = usage.calls.length
  return (
    <p className="text-xs text-gray-500" title={`${calls} AI call${calls === 1 ? '' : 's'} · thinking tokens are billed as output`}>
      <span className="font-semibold">Run cost:</span> {formatRunCost(usage)}
    </p>
  )
}
