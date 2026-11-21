import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-6xl text-ink">404</p>
        <p className="mt-3 text-ink-2">This page does not exist.</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-clay underline underline-offset-4">
          Back to RoomSense
        </Link>
      </div>
    </main>
  )
}
