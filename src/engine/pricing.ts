/**
 * Price helpers in Pakistani Rupees.
 * Pakistani digit grouping: the last three digits form one group, every group
 * above that has two digits (lakh / crore style): 12,34,56,789.
 */

/** Price of a configured product: (size price + finish surcharge) x quantity. */
export function configuredPrice(sizePrice: number, finishDelta = 0, qty = 1): number {
  return Math.max(0, Math.round((sizePrice + finishDelta) * Math.max(0, Math.floor(qty))))
}

/** Sum of line prices. */
export function sumPrices(lines: { price: number; qty?: number }[]): number {
  return lines.reduce((s, l) => s + Math.round(l.price) * (l.qty ?? 1), 0)
}

/** Apply a percentage discount, rounded to the nearest rupee. */
export function applyDiscount(price: number, pct: number): number {
  return Math.round(price * (1 - Math.min(100, Math.max(0, pct)) / 100))
}

/** Group an integer string the Pakistani way: "124500" -> "1,24,500". */
export function groupPk(digits: string): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  let rest = digits.slice(0, -3)
  const parts: string[] = []
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2))
    rest = rest.slice(0, -2)
  }
  if (rest) parts.unshift(rest)
  return `${parts.join(',')},${last3}`
}

/** Format rupees: pkr(124500) -> "Rs 1,24,500". Rounds to whole rupees. */
export function pkr(n: number): string {
  const v = Math.round(n)
  const s = groupPk(String(Math.abs(v)))
  return v < 0 ? `-Rs ${s}` : `Rs ${s}`
}

/** Short form for badges: 1,24,500 -> "Rs 1.25 lakh"; 2,50,00,000 -> "Rs 2.5 crore". */
export function pkrCompact(n: number): string {
  const v = Math.round(n)
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  const trim = (x: number) => String(Math.round(x * 100) / 100)
  if (a >= 1e7) return `${sign}Rs ${trim(a / 1e7)} crore`
  if (a >= 1e5) return `${sign}Rs ${trim(a / 1e5)} lakh`
  return pkr(v)
}
