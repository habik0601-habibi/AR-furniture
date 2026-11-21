// Orientation helper: per-node bounds and where the tallest vertices sit (back of seats / headboards).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { models } from './models.config.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const target = process.argv[2] ? path.resolve(process.argv[2]) : null
const files = target ? [[path.basename(target), target]] : models.map(m => [m.slug, path.join(here, 'raw', m.id, `${m.id}.${m.source === 'khronos' ? 'glb' : 'gltf'}`)])
for (const [name, file] of files) {
  const doc = await io.read(file)
  const pts = []
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue
    const b = getBounds(n)
    console.log(name, 'node', n.getName(), 'min', b.min.map(v => +v.toFixed(2)), 'max', b.max.map(v => +v.toFixed(2)))
    const M = n.getWorldMatrix()
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'); const v = [0, 0, 0]
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v)
        const x = M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12], y = M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13], z = M[2]*v[0]+M[6]*v[1]+M[10]*v[2]+M[14]
        pts.push([x, y, z])
      }
    }
  }
  pts.sort((a, b) => b[1] - a[1])
  const top = pts.slice(0, Math.max(1, Math.floor(pts.length * 0.08)))
  const mean = i => +(top.reduce((s, p) => s + p[i], 0) / top.length).toFixed(3)
  const all = i => +(pts.reduce((s, p) => s + p[i], 0) / pts.length).toFixed(3)
  console.log(name, 'TOP8% mean x,y,z =', mean(0), mean(1), mean(2), ' ALL mean x,y,z =', all(0), all(1), all(2))
}
