import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-200 mb-4">404</p>
        <p className="text-lg text-gray-600 mb-6">Page not found</p>
        <Link
          href="/"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
