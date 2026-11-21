/**
 * Anonymous shopper session id (random, per browser) used only to group a
 * shopper's analytics events and to rate-limit quote requests. No personal data.
 */
const KEY = 'roomsense-session'

function random(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function sessionId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing && existing.length >= 8) return existing
    const id = random()
    localStorage.setItem(KEY, id)
    return id
  } catch {
    return random()
  }
}

/** Small JSON helpers for per-browser conveniences (the shopper's measured room). */
export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode): the app still works for this visit */
  }
}
