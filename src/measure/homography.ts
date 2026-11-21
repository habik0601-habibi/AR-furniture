/**
 * Planar homography (image <-> floor plane) by the normalised Direct Linear
 * Transform, plus first-order error propagation for tapped measurements.
 *
 * A homography H (3x3, defined up to scale) maps a point (x, y) to
 *   u = (h0 x + h1 y + h2) / (h6 x + h7 y + h8)
 *   v = (h3 x + h4 y + h5) / (h6 x + h7 y + h8)
 * Matrices are stored row-major as 9 numbers.
 */
import type { Vec2 } from './types'

export type Mat3 = number[]

/** Solve A x = b by Gaussian elimination with partial pivoting. Throws if singular. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('Singular system (points may be collinear)')
    if (piv !== col) [M[piv], M[col]] = [M[col], M[piv]]
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}

export function mul3(A: Mat3, B: Mat3): Mat3 {
  const C = new Array<number>(9).fill(0)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]
  return C
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-15) throw new Error('Matrix is not invertible')
  const inv = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ]
  return inv.map((x) => x / det)
}

/** Scale so that h8 = 1 (when possible), for readable, comparable matrices. */
export function normalizeH(H: Mat3): Mat3 {
  const s = Math.abs(H[8]) > 1e-12 ? H[8] : Math.hypot(...H)
  return H.map((x) => x / s)
}

export function applyH(H: Mat3, p: Vec2): Vec2 {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

/**
 * Hartley normalisation: translate the centroid to the origin and scale so the
 * mean distance from it is sqrt(2). Keeps the DLT well conditioned when image
 * coordinates are in the thousands and floor coordinates in tens.
 */
export function normalizationTransform(pts: Vec2[]): Mat3 {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const md = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length
  const s = md > 0 ? Math.SQRT2 / md : 1
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]
}

/**
 * Homography mapping src[i] -> dst[i] (n >= 4, no three of the first four collinear).
 *
 * With h8 fixed to 1, each correspondence (x, y) -> (u, v) gives two linear equations
 *   [x y 1 0 0 0 -u·x -u·y] h = u
 *   [0 0 0 x y 1 -v·x -v·y] h = v
 * Exactly 4 points: the 8x8 system is solved directly. More points: linear least
 * squares through the normal equations. Fixing h8 = 1 is safe after normalisation
 * because the origin is the centroid of the source points, which maps to a finite point.
 */
export function computeHomography(src: Vec2[], dst: Vec2[]): Mat3 {
  if (src.length !== dst.length) throw new Error('Point lists differ in length')
  if (src.length < 4) throw new Error('A homography needs at least 4 correspondences')
  const Ts = normalizationTransform(src)
  const Td = normalizationTransform(dst)
  const s = src.map((p) => applyH(Ts, p))
  const d = dst.map((p) => applyH(Td, p))
  const A: number[][] = []
  const b: number[] = []
  for (let i = 0; i < s.length; i++) {
    const { x, y } = s[i]
    const { x: u, y: v } = d[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  let h: number[]
  if (A.length === 8) {
    h = solveLinear(A, b)
  } else {
    const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0))
    const Atb = new Array<number>(8).fill(0)
    for (let r = 0; r < A.length; r++) {
      for (let i = 0; i < 8; i++) {
        Atb[i] += A[r][i] * b[r]
        for (let j = 0; j < 8; j++) AtA[i][j] += A[r][i] * A[r][j]
      }
    }
    h = solveLinear(AtA, Atb)
  }
  const Hn: Mat3 = [...h, 1]
  return normalizeH(mul3(invert3(Td), mul3(Hn, Ts)))
}

/**
 * Focal length implied by a world-plane -> image homography, assuming square pixels,
 * zero skew and the principal point at (cx, cy). H = K [r1 r2 t] up to scale, so with
 * h1, h2 its first two columns and w = K^-T K^-1 = diag(1/f², 1/f², 1):
 *   h1ᵀ w h2 = 0           ->  f² = -(h11 h12 + h21 h22) / (h31 h32)
 *   h1ᵀ w h1 = h2ᵀ w h2    ->  f² = -(h11² + h21² - h12² - h22²) / (h31² - h32²)
 * Returns both estimates of f² (either may be negative or non-finite when the view is
 * close to fronto-parallel). Used to check that four tapped corners are a plausible
 * picture of a flat rectangle, and to tell the long side of the sheet from the short one.
 */
export function focalSquaredEstimates(Hworld2img: Mat3, cx: number, cy: number): [number, number] {
  const H = mul3([1, 0, -cx, 0, 1, -cy, 0, 0, 1], Hworld2img)
  const [h11, h12, , h21, h22, , h31, h32] = H
  const f1 = -(h11 * h12 + h21 * h22) / (h31 * h32)
  const f2 = -(h11 * h11 + h21 * h21 - h12 * h12 - h22 * h22) / (h31 * h31 - h32 * h32)
  return [f1, f2]
}

/**
 * Least-squares solution of both constraints for k = 1/f²:
 *   k·A1 + B1 = 0,  k·A2 + B2 = 0
 * with A1 = h11h12 + h21h22, B1 = h31h32, A2 = h11² + h21² - h12² - h22², B2 = h31² - h32².
 * `residual` is the misfit relative to the size of the B terms (0 = perfectly consistent).
 * One constraint degenerates when an axis of the sheet is parallel to the image plane,
 * which is why both are solved together instead of separately.
 */
export function focalFit(Hworld2img: Mat3, cx: number, cy: number): { k: number; residual: number } {
  const H = mul3([1, 0, -cx, 0, 1, -cy, 0, 0, 1], Hworld2img)
  const [h11, h12, , h21, h22, , h31, h32] = H
  const A1 = h11 * h12 + h21 * h22
  const B1 = h31 * h32
  const A2 = h11 * h11 + h21 * h21 - h12 * h12 - h22 * h22
  const B2 = h31 * h31 - h32 * h32
  const den = A1 * A1 + A2 * A2
  if (den < 1e-300) return { k: NaN, residual: Infinity }
  const k = -(A1 * B1 + A2 * B2) / den
  const mag = Math.hypot(B1, B2) || 1e-300
  const residual = Math.hypot(k * A1 + B1, k * A2 + B2) / mag
  return { k, residual }
}

/** Sort four points clockwise on screen (y down), starting from the top-left-most one. */
export function sortClockwise(pts: Vec2[]): Vec2[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx),
  )
  // atan2 in a y-down frame increases clockwise on screen. Start at the point with min x+y.
  let start = 0
  for (let i = 1; i < sorted.length; i++)
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}

export interface ReferenceSolution {
  /** Image -> floor (cm) homography. */
  H: Mat3
  /** Image corners, clockwise, in the order matched to `world`. */
  image: Vec2[]
  /** Floor coordinates (cm) of the reference corners. */
  world: Vec2[]
  /** Focal length (px) implied by the solution, if it could be estimated. */
  focal?: number
  /** False when the long/short side could not be told apart reliably. */
  orientationConfident: boolean
  /** False when the four corners do not look like a flat rectangle in perspective. */
  plausible: boolean
}

function worldRect(w: number, h: number): Vec2[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

/**
 * Solve the reference object: four tapped image corners (any order) of a w x h cm
 * rectangle lying flat on the floor. Chooses which image edge is the long side using
 * focal-length consistency (both constraints must agree for the right assignment),
 * falling back to apparent edge lengths for near top-down views.
 */
export function solveReference(
  tapped: Vec2[],
  wCm: number,
  hCm: number,
  imageWidth: number,
  imageHeight: number,
  swap = false,
): ReferenceSolution {
  if (tapped.length !== 4) throw new Error('Tap exactly 4 corners of the reference')
  const image = sortClockwise(tapped)
  const cx = imageWidth / 2
  const cy = imageHeight / 2
  const maxDim = Math.max(imageWidth, imageHeight)

  const fPrior = 0.75 * maxDim // typical phone main camera (~26 mm equivalent)
  const evaluate = (w: number, h: number) => {
    const world = worldRect(w, h)
    const fit = focalFit(computeHomography(world, image), cx, cy)
    const ok = fit.k > 0 && Number.isFinite(fit.k)
    const focal = ok ? 1 / Math.sqrt(fit.k) : undefined
    const inRange = focal !== undefined && focal > 0.3 * maxDim && focal < 4 * maxDim
    // Lower is better: constraint residual, plus a weak prior on the focal length,
    // which decides when the view leaves only one informative constraint.
    const score = (ok ? 0 : 10) + 5 * fit.residual + (focal ? 0.5 * Math.abs(Math.log(focal / fPrior)) : 5)
    return { world, ok, score, focal, plausible: ok && inRange && fit.residual < 0.2 }
  }
  const A = evaluate(wCm, hCm)
  const B = evaluate(hCm, wCm)

  let pick = A
  let confident = true
  if (Math.abs(wCm - hCm) < 1e-6) {
    pick = A
  } else if (Math.abs(A.score - B.score) > 0.3) {
    pick = A.score < B.score ? A : B
  } else {
    // Near top-down view: perspective barely changes lengths, so trust apparent lengths.
    const e = (i: number) => Math.hypot(image[(i + 1) % 4].x - image[i].x, image[(i + 1) % 4].y - image[i].y)
    const firstPairLonger = e(0) + e(2) >= e(1) + e(3)
    pick = firstPairLonger === wCm >= hCm ? A : B
    confident = false
  }
  if (swap) pick = pick === A ? B : A
  const H = computeHomography(image, pick.world)
  return {
    H,
    image,
    world: pick.world,
    focal: pick.focal,
    orientationConfident: confident,
    plausible: pick.plausible,
  }
}

/**
 * First-order (linearised) propagation of click error.
 *
 * Every tapped coordinate - the 8 reference-corner coordinates and the coordinates of
 * the measured points - is treated as independently wrong by +/- sigmaPx. The partial
 * derivative of the measurement with respect to each one is taken by central
 * differences, and the standard deviation is sqrt(sum((df/dc_i · sigma)²)).
 * Errors grow with distance from the sheet because a small tilt error in the
 * estimated plane is amplified far away, which this captures directly.
 */
export function propagateError(
  refImage: Vec2[],
  refWorld: Vec2[],
  points: Vec2[],
  measure: (H: Mat3, pts: Vec2[]) => number,
  sigmaPx: number,
): number {
  const H0 = computeHomography(refImage, refWorld)
  let variance = 0
  const eps = sigmaPx
  for (let i = 0; i < refImage.length; i++) {
    for (const axis of ['x', 'y'] as const) {
      const plus = refImage.map((p, j) => (j === i ? { ...p, [axis]: p[axis] + eps } : p))
      const minus = refImage.map((p, j) => (j === i ? { ...p, [axis]: p[axis] - eps } : p))
      const fp = measure(computeHomography(plus, refWorld), points)
      const fm = measure(computeHomography(minus, refWorld), points)
      const deriv = (fp - fm) / 2 // already multiplied by sigma since eps = sigma
      variance += deriv * deriv
    }
  }
  for (let i = 0; i < points.length; i++) {
    for (const axis of ['x', 'y'] as const) {
      const plus = points.map((p, j) => (j === i ? { ...p, [axis]: p[axis] + eps } : p))
      const minus = points.map((p, j) => (j === i ? { ...p, [axis]: p[axis] - eps } : p))
      const deriv = (measure(H0, plus) - measure(H0, minus)) / 2
      variance += deriv * deriv
    }
  }
  return Math.sqrt(variance)
}

/** +/- cm (1 sigma) of the floor distance between two tapped image points. */
export function lengthSigma(refImage: Vec2[], refWorld: Vec2[], p: Vec2, q: Vec2, sigmaPx: number): number {
  return propagateError(
    refImage,
    refWorld,
    [p, q],
    (H, [a, b]) => {
      const A = applyH(H, a)
      const B = applyH(H, b)
      return Math.hypot(A.x - B.x, A.y - B.y)
    },
    sigmaPx,
  )
}

/** +/- cm (1 sigma, radial) of the floor position of one tapped image point. */
export function pointSigma(refImage: Vec2[], refWorld: Vec2[], p: Vec2, sigmaPx: number): number {
  const sx = propagateError(refImage, refWorld, [p], (H, [a]) => applyH(H, a).x, sigmaPx)
  const sy = propagateError(refImage, refWorld, [p], (H, [a]) => applyH(H, a).y, sigmaPx)
  return Math.hypot(sx, sy)
}

/** True when the point lies on the camera side of the horizon (maps to a finite floor point in front). */
export function isBelowHorizon(Himg2floor: Mat3, p: Vec2, refImage: Vec2[]): boolean {
  const w = (q: Vec2) => Himg2floor[6] * q.x + Himg2floor[7] * q.y + Himg2floor[8]
  const c = refImage.reduce((s, q) => ({ x: s.x + q.x / 4, y: s.y + q.y / 4 }), { x: 0, y: 0 })
  return Math.sign(w(p)) === Math.sign(w(c)) && Math.abs(w(p)) > 1e-9
}
