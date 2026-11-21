// Ray-casts the built models to find on-surface hotspot positions (model space, metres).
// usage: node scripts/models/probe.mjs <slug> "top x z" "front x y" "back x y" "side +1|-1 y z" "mat Name"
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { createRequire } from 'node:module'
const draco3d = createRequire(import.meta.url)('draco3dgltf')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const [slug, ...probes] = process.argv.slice(2)
const doc = await io.read(`public/models/${slug}.glb`)
const tris = []
for (const n of doc.getRoot().listNodes()) {
  const mesh = n.getMesh(); if (!mesh) continue
  const M = n.getWorldMatrix()
  const T = (v) => [M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12], M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13], M[2]*v[0]+M[6]*v[1]+M[10]*v[2]+M[14]]
  for (const p of mesh.listPrimitives()) {
    const mat = p.getMaterial()?.getName(); const pos = p.getAttribute('POSITION'); const idx = p.getIndices()
    const get = (i) => T(pos.getElement(idx.getScalar(i), [0, 0, 0]))
    for (let i = 0; i < idx.getCount(); i += 3) tris.push({ mat, a: get(i), b: get(i + 1), c: get(i + 2) })
  }
}
const sub = (u, v) => [u[0]-v[0], u[1]-v[1], u[2]-v[2]], cross = (u, v) => [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]], dot = (u, v) => u[0]*v[0]+u[1]*v[1]+u[2]*v[2]
function cast(o, d) {
  let best = null
  for (const t of tris) {
    const e1 = sub(t.b, t.a), e2 = sub(t.c, t.a), p = cross(d, e2), det = dot(e1, p)
    if (Math.abs(det) < 1e-12) continue
    const inv = 1 / det, s = sub(o, t.a), u = dot(s, p) * inv; if (u < 0 || u > 1) continue
    const q = cross(s, e1), v = dot(d, q) * inv; if (v < 0 || u + v > 1) continue
    const dist = dot(e2, q) * inv
    if (dist > 0 && (!best || dist < best.dist)) best = { dist, mat: t.mat }
  }
  return best
}
const f = (n) => +n.toFixed(3)
for (const pr of probes) {
  const [kind, ...r] = pr.split(' ').map((x, i) => (i && x !== '' && !isNaN(+x) ? +x : x))
  let o, d, normal
  if (kind === 'top') { o = [r[0], 10, r[1]]; d = [0, -1, 0]; normal = '0 1 0' }
  else if (kind === 'front') { o = [r[0], r[1], 10]; d = [0, 0, -1]; normal = '0 0 1' }
  else if (kind === 'back') { o = [r[0], r[1], -10]; d = [0, 0, 1]; normal = '0 0 -1' }
  else if (kind === 'side') { o = [10 * r[0], r[1], r[2]]; d = [-r[0], 0, 0]; normal = `${r[0]} 0 0` }
  else if (kind === 'foot') { // foot sx sz [mat] [y]: outermost low vertex toward a corner
    const [sx, sz, mat, yy = 0.08] = r
    const ps = tris.filter((t) => !mat || mat === '-' || t.mat === mat).flatMap((t) => [t.a, t.b, t.c]).filter((p) => p[1] < 0.05)
    let b = ps[0]; for (const p of ps) if (sx * p[0] + sz * p[2] > sx * b[0] + sz * b[2]) b = p
    console.log(pr, `=> position: '${f(b[0] - sx * 0.01)} ${yy} ${f(b[2] - sz * 0.01)}', normal: '0 0 1'`); continue
  }
  else if (kind === 'mat') {
    const ps = tris.filter((t) => t.mat === r[0]).flatMap((t) => [t.a, t.b, t.c])
    const mm = (k) => `${f(Math.min(...ps.map((p) => p[k])))}..${f(Math.max(...ps.map((p) => p[k])))}`
    console.log(pr, '=> x', mm(0), 'y', mm(1), 'z', mm(2)); continue
  }
  const hit = cast(o, d)
  if (!hit) { console.log(pr, '=> miss'); continue }
  const p = o.map((v, i) => f(v + d[i] * hit.dist))
  console.log(pr, `=> position: '${p.join(' ')}', normal: '${normal}'  (${hit.mat})`)
}
