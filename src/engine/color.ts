/**
 * Colour science for the recommender: sRGB <-> CIELAB (D65), colour
 * differences (CIE76 and CIEDE2000) and dominant colours of a photo via
 * seeded k-means++ clustering in Lab space (perceptually uniform, so cluster
 * centres are meaningful "paint chips").
 */

export interface RGB {
  r: number
  g: number
  b: number
}
export interface Lab {
  L: number
  a: number
  b: number
}
export interface LCh {
  L: number
  C: number
  /** Hue angle in degrees, 0-360. */
  h: number
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`)
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const toLinear = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

// D65 reference white
const XN = 0.95047
const YN = 1.0
const ZN = 1.08883
const EPS_LAB = 216 / 24389
const KAPPA = 24389 / 27

export function rgbToLab({ r, g, b }: RGB): Lab {
  const R = toLinear(r)
  const G = toLinear(g)
  const B = toLinear(b)
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN
  const Y = (0.2126729 * R + 0.7151522 * G + 0.072175 * B) / YN
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN
  const f = (t: number) => (t > EPS_LAB ? Math.cbrt(t) : (KAPPA * t + 16) / 116)
  const fx = f(X)
  const fy = f(Y)
  const fz = f(Z)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToRgb({ L, a, b }: Lab): RGB {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inv = (t: number) => (t ** 3 > EPS_LAB ? t ** 3 : (116 * t - 16) / KAPPA)
  const X = inv(fx) * XN
  const Y = (L > KAPPA * EPS_LAB ? fy ** 3 : L / KAPPA) * YN
  const Z = inv(fz) * ZN
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
  const c = (v: number) => Math.max(0, Math.min(255, fromLinear(Math.max(0, v))))
  return { r: c(R), g: c(G), b: c(B) }
}

export const hexToLab = (hex: string) => rgbToLab(hexToRgb(hex))
export const labToHex = (lab: Lab) => rgbToHex(labToRgb(lab))

export function labToLch({ L, a, b }: Lab): LCh {
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return { L, C: Math.hypot(a, b), h: h < 0 ? h + 360 : h }
}

/** CIE76: Euclidean distance in Lab. ~2.3 is a just-noticeable difference. */
export function deltaE76(x: Lab, y: Lab): number {
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b)
}

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005 formulation), kL = kC = kH = 1. */
export function deltaE2000(x: Lab, y: Lab): number {
  const rad = Math.PI / 180
  const C1 = Math.hypot(x.a, x.b)
  const C2 = Math.hypot(y.a, y.b)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const a1 = (1 + G) * x.a
  const a2 = (1 + G) * y.a
  const C1p = Math.hypot(a1, x.b)
  const C2p = Math.hypot(a2, y.b)
  const hp = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0
    const h = Math.atan2(b, a) / rad
    return h < 0 ? h + 360 : h
  }
  const h1 = hp(x.b, a1)
  const h2 = hp(y.b, a2)
  const dL = y.L - x.L
  const dC = C2p - C1p
  let dh = 0
  if (C1p * C2p !== 0) {
    dh = h2 - h1
    if (dh > 180) dh -= 360
    else if (dh < -180) dh += 360
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2)
  const Lm = (x.L + y.L) / 2
  const Cmp = (C1p + C2p) / 2
  let hm = h1 + h2
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hm = (h1 + h2) / 2
    else hm = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2)
  const Sc = 1 + 0.045 * Cmp
  const Sh = 1 + 0.015 * Cmp * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}

/** Chroma below this reads as a neutral (white, grey, black, beige-ish greys). */
export const NEUTRAL_CHROMA = 12

export function isNeutral(lab: Lab): boolean {
  return Math.hypot(lab.a, lab.b) < NEUTRAL_CHROMA
}

/** Warm hues: reds, oranges, browns and yellows (Lab hue roughly 20-100 degrees). */
export function isWarm(lab: Lab): boolean {
  const { C, h } = labToLch(lab)
  return C >= 8 && (h <= 100 || h >= 345)
}

/** Smallest angle between two hues, 0-180. */
export function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360
  return d > 180 ? 360 - d : d
}

/* ------------------------------------------------------------------ */
/* Dominant colours                                                    */
/* ------------------------------------------------------------------ */

function rng32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DominantOptions {
  seed?: number
  /** Max pixels sampled (evenly strided). Default 4000. */
  sample?: number
  iterations?: number
}

/**
 * Dominant colours of RGBA pixel data (e.g. canvas ImageData.data), largest
 * cluster first. k-means++ seeding, Lloyd iterations, all in CIELAB.
 * Transparent pixels (alpha < 128) are ignored.
 */
export function dominantColors(pixels: Uint8ClampedArray, k = 5, opts: DominantOptions = {}): string[] {
  const total = Math.floor(pixels.length / 4)
  const maxSample = opts.sample ?? 4000
  const stride = Math.max(1, Math.floor(total / maxSample))
  const pts: Lab[] = []
  for (let i = 0; i < total; i += stride) {
    const o = i * 4
    if (pixels[o + 3] < 128) continue
    pts.push(rgbToLab({ r: pixels[o], g: pixels[o + 1], b: pixels[o + 2] }))
  }
  if (!pts.length) return []
  const rand = rng32(opts.seed ?? 7)
  const d2 = (p: Lab, q: Lab) => (p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2

  // k-means++ seeding: next centre chosen with probability ~ squared distance
  const centres: Lab[] = [pts[Math.floor(rand() * pts.length)]]
  const dist = pts.map((p) => d2(p, centres[0]))
  while (centres.length < k) {
    const sum = dist.reduce((s, v) => s + v, 0)
    if (sum <= 1e-9) break // fewer distinct colours than k
    let r = rand() * sum
    let idx = 0
    while (idx < pts.length - 1 && (r -= dist[idx]) > 0) idx++
    centres.push(pts[idx])
    for (let i = 0; i < pts.length; i++) dist[i] = Math.min(dist[i], d2(pts[i], pts[idx]))
  }

  const assign = new Int32Array(pts.length)
  const counts = new Array<number>(centres.length).fill(0)
  for (let iter = 0; iter < (opts.iterations ?? 15); iter++) {
    let moved = false
    for (let i = 0; i < pts.length; i++) {
      let bi = 0
      let bd = Infinity
      for (let c = 0; c < centres.length; c++) {
        const d = d2(pts[i], centres[c])
        if (d < bd) {
          bd = d
          bi = c
        }
      }
      if (assign[i] !== bi) moved = true
      assign[i] = bi
    }
    const acc = centres.map(() => ({ L: 0, a: 0, b: 0 }))
    counts.fill(0)
    for (let i = 0; i < pts.length; i++) {
      const c = assign[i]
      acc[c].L += pts[i].L
      acc[c].a += pts[i].a
      acc[c].b += pts[i].b
      counts[c]++
    }
    for (let c = 0; c < centres.length; c++)
      if (counts[c]) centres[c] = { L: acc[c].L / counts[c], a: acc[c].a / counts[c], b: acc[c].b / counts[c] }
    if (!moved && iter > 0) break
  }
  return centres
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => labToHex(x.c))
}
