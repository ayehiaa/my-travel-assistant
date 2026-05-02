export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}
