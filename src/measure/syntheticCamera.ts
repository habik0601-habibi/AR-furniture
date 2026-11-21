/**
 * A tiny pinhole camera used by the unit tests to generate exact synthetic photos
 * of a floor plane and of a box-shaped room. Not used by the app at runtime.
 *
 * Plan coordinates: x right, y "down" when seen from above (so moving forward into
 * the scene, away from the camera, is -y). Height z is up.
 */
import type { Vec2 } from './types'

export interface Camera {
  /** Camera position on the plan (cm) and height above the floor. */
  x: number
  y: number
  height: number
  /** Downward pitch in degrees (0 = horizontal). */
  pitchDeg: number
  /** Yaw in degrees: 0 looks towards -y (north). */
  yawDeg?: number
  f: number
  cx: number
  cy: number
}

interface Basis {
  r: [number, number, number]
  down: [number, number, number]
  z: [number, number, number]
}

/** World vectors are (east, north, up) = (x, -y, z). */
function basis(cam: Camera): Basis {
  const p = (cam.pitchDeg * Math.PI) / 180
  const yaw = ((cam.yawDeg ?? 0) * Math.PI) / 180
  const fwd: [number, number] = [Math.sin(yaw), Math.cos(yaw)] // east, north
  const right: [number, number] = [Math.cos(yaw), -Math.sin(yaw)]
  const z: [number, number, number] = [fwd[0] * Math.cos(p), fwd[1] * Math.cos(p), -Math.sin(p)]
  const down: [number, number, number] = [-fwd[0] * Math.sin(p), -fwd[1] * Math.sin(p), -Math.cos(p)]
  return { r: [right[0], right[1], 0], down, z }
}

const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Project a 3-D plan point (x, y on the plan, z height) to the image. */
export function project(cam: Camera, p: { x: number; y: number; z?: number }): Vec2 {
  const B = basis(cam)
  const d = [p.x - cam.x, -(p.y - cam.y), (p.z ?? 0) - cam.height]
  const zc = dot3(d, B.z)
  return { x: (cam.f * dot3(d, B.r)) / zc + cam.cx, y: (cam.f * dot3(d, B.down)) / zc + cam.cy }
}

/**
 * Render inverse depth (1 / camera-z) of an axis-aligned box room
 * [0, roomW] x [0, roomD] x [0, roomH] seen from inside.
 */
export function renderRoomInverseDepth(
  cam: Camera,
  width: number,
  height: number,
  room: { w: number; d: number; h: number },
): Float32Array {
  const B = basis(cam)
  const out = new Float32Array(width * height)
  const o = [cam.x, -cam.y, cam.height]
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const xn = (u + 0.5 - cam.cx) / cam.f
      const yn = (v + 0.5 - cam.cy) / cam.f
      // Ray direction with unit camera-z component, so the hit parameter t equals depth.
      const dir = [0, 1, 2].map((k) => B.r[k] * xn + B.down[k] * yn + B.z[k])
      let tBest = Infinity
      // Planes: east (x), north (= -y) and up, each with two bounds.
      const bounds: [number, number][] = [
        [0, room.w],
        [-room.d, 0],
        [0, room.h],
      ]
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dir[k]) < 1e-12) continue
        for (const b of bounds[k]) {
          const t = (b - o[k]) / dir[k]
          if (t > 1e-6 && t < tBest) tBest = t
        }
      }
      out[v * width + u] = 1 / tBest
    }
  }
  return out
}
