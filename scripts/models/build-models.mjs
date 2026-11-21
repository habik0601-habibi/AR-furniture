#!/usr/bin/env node
/**
 * Builds the optimised catalogue models: scripts/models/raw/** -> public/models/<slug>.glb
 *
 *   node scripts/models/download-models.mjs   # once, fetches the sources
 *   node scripts/models/build-models.mjs      # [--webp] [--only=slug,slug]
 *
 * Per model (rules in models.config.mjs):
 *  1. clean up (drop material variants, lights, labels; close ajar doors; rename materials)
 *  2. flatten and bake every node transform (+ optional rotateY / scale fix) into the geometry
 *  3. split the single Poly Haven atlas material into a tintable part ("Fabric"/"Wood"/...) and
 *     an untinted part, by sampling the base-colour texture per UV island; the tintable part
 *     gets a light greyscale copy of the texture so a finish colour multiplies cleanly
 *  4. dedup, join, weld, prune, centre (X/Z centred, bottom at y = 0)
 *  5. resize textures (max 1024, 2048 for hero items) and re-encode: JPEG by default
 *     (PNG kept where alpha is used); --webp switches to WebP
 *  6. Draco geometry compression (model-viewer ships a Draco decoder by default)
 *
 * Writes scripts/models/models.meta.json with the final bounding box (cm) and materials.
 * Units: metres, Y-up, front facing +Z.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import {
  center,
  clearNodeTransform,
  compactPrimitive,
  dedup,
  draco,
  flatten,
  join,
  prune,
  textureCompress,
  weld,
} from '@gltf-transform/functions'
import { models } from './models.config.mjs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')
const draco3d = require('draco3dgltf')

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const rawDir = path.join(here, 'raw')
const outDir = path.join(root, 'public/models')

const args = process.argv.slice(2)
const useWebp = args.includes('--webp')
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
})

// ---------- small maths helpers ----------
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const hexToLinear = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255))
}
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
function hsv(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}
/** column-major 4x4 multiply */
function mul(a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function globalMatrix(rotateYDeg = 0, scale = [1, 1, 1]) {
  const t = (rotateYDeg * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const R = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
  const S = [scale[0], 0, 0, 0, 0, scale[1], 0, 0, 0, 0, scale[2], 0, 0, 0, 0, 1]
  return mul(R, S)
}

// ---------- texture helpers ----------
async function decodeRGB(image, size) {
  const { data, info } = await sharp(image)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}
function sample(tex, u, v) {
  u = u - Math.floor(u)
  v = v - Math.floor(v)
  const x = Math.min(tex.w - 1, Math.floor(u * tex.w))
  const y = Math.min(tex.h - 1, Math.floor(v * tex.h))
  const i = (y * tex.w + x) * 3
  return [tex.data[i] / 255, tex.data[i + 1] / 255, tex.data[i + 2] / 255]
}
/** Light greyscale copy of an image: mean luminance -> 0.9, detail contrast preserved/boosted. */
async function neutralise(image, meanL) {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const target = 0.9
  const k = Math.min(2.2, Math.max(1, target / Math.max(meanL, 0.01)))
  const out = Buffer.alloc(info.width * info.height * 3)
  for (let p = 0, q = 0; p < data.length; p += info.channels, q += 3) {
    const L = luma(data[p] / 255, data[p + 1] / 255, data[p + 2] / 255)
    const n = Math.round(Math.min(1, Math.max(0, target + (L - meanL) * k)) * 255)
    out[q] = out[q + 1] = out[q + 2] = n
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer()
}

// ---------- split one atlas material into tint / keep by UV island ----------
async function splitByIsland(doc, rule, bounds) {
  const rootP = doc.getRoot()
  const sourceMats = rootP.listMaterials()
  if (sourceMats.length !== 1) throw new Error(`split expects 1 material, found ${sourceMats.length}`)
  const keepMat = sourceMats[0]
  const baseTex = keepMat.getBaseColorTexture()
  const tex = await decodeRGB(baseTex.getImage(), 1024)
  const tintMat = keepMat.clone().setName(rule.material)
  keepMat.setName(rule.keep)
  const lumSamples = []
  let tintArea = 0
  let keepArea = 0
  const [minY, maxY] = [bounds.min[1], bounds.max[1]]

  for (const mesh of rootP.listMeshes()) {
    for (const prim of [...mesh.listPrimitives()]) {
      if (prim.getMaterial() !== keepMat) continue
      const pos = prim.getAttribute('POSITION')
      const uv = prim.getAttribute('TEXCOORD_0')
      const idxAcc = prim.getIndices()
      const count = idxAcc ? idxAcc.getCount() : pos.getCount()
      const index = (i) => (idxAcc ? idxAcc.getScalar(i) : i)
      const triCount = count / 3
      // union-find over vertex indices -> connected islands
      const parent = new Int32Array(pos.getCount()).map((_, i) => i)
      const find = (a) => {
        while (parent[a] !== a) a = parent[a] = parent[parent[a]]
        return a
      }
      for (let t = 0; t < triCount; t++) {
        const a = find(index(t * 3))
        parent[find(index(t * 3 + 1))] = a
        parent[find(index(t * 3 + 2))] = a
      }
      const vote = new Map()
      const A = [0, 0, 0]
      const B = [0, 0, 0]
      const C = [0, 0, 0]
      const ua = [0, 0]
      const ub = [0, 0]
      const uc = [0, 0]
      const triIsland = new Int32Array(triCount)
      const triLum = new Float32Array(triCount)
      for (let t = 0; t < triCount; t++) {
        const i0 = index(t * 3)
        const i1 = index(t * 3 + 1)
        const i2 = index(t * 3 + 2)
        pos.getElement(i0, A)
        pos.getElement(i1, B)
        pos.getElement(i2, C)
        uv.getElement(i0, ua)
        uv.getElement(i1, ub)
        uv.getElement(i2, uc)
        const ux = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
        const vx = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]
        const area =
          Math.hypot(ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]) / 2
        // average of centroid + 3 vertex samples
        let r = 0
        let g = 0
        let b = 0
        for (const [u, v] of [
          [(ua[0] + ub[0] + uc[0]) / 3, (ua[1] + ub[1] + uc[1]) / 3],
          ua,
          ub,
          uc,
        ]) {
          const c = sample(tex, u, v)
          r += c[0] / 4
          g += c[1] / 4
          b += c[2] / 4
        }
        const y = ((A[1] + B[1] + C[1]) / 3 - minY) / (maxY - minY || 1)
        const isTint = rule.classify({ r, g, b, ...hsv(r, g, b), l: luma(r, g, b), y })
        const island = find(i0)
        triIsland[t] = island
        triLum[t] = luma(r, g, b)
        const cur = vote.get(island) ?? 0
        vote.set(island, cur + (isTint ? area : -area) + (isTint ? 1e-9 : -1e-9))
      }
      const tintIdx = []
      const keepIdx = []
      for (let t = 0; t < triCount; t++) {
        const list = vote.get(triIsland[t]) > 0 ? tintIdx : keepIdx
        list.push(index(t * 3), index(t * 3 + 1), index(t * 3 + 2))
        if (list === tintIdx && t % 3 === 0) lumSamples.push(triLum[t])
      }
      tintArea += tintIdx.length
      keepArea += keepIdx.length
      const IndexArray = pos.getCount() > 65535 ? Uint32Array : Uint16Array
      if (tintIdx.length) {
        const tp = prim.clone().setMaterial(tintMat)
        tp.setIndices(doc.createAccessor().setType('SCALAR').setArray(new IndexArray(tintIdx)).setBuffer(rootP.listBuffers()[0]))
        mesh.addPrimitive(tp)
        compactPrimitive(tp)
      }
      if (keepIdx.length) {
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new IndexArray(keepIdx)).setBuffer(rootP.listBuffers()[0]))
        compactPrimitive(prim)
      } else {
        prim.dispose()
      }
    }
  }
  const meanL = lumSamples.length ? lumSamples.reduce((s, v) => s + v, 0) / lumSamples.length : 0.5
  const pct = Math.round((100 * tintArea) / Math.max(1, tintArea + keepArea))
  console.log(`   split: ${pct}% of triangles -> ${rule.material}, rest -> ${rule.keep}; tint mean luma ${meanL.toFixed(2)}`)
  if (!keepArea) keepMat.dispose()
  return { tintMat, meanL }
}

async function applyNeutralise(doc, mat, meanL) {
  const t = mat.getBaseColorTexture()
  if (!t) return
  if (meanL == null) {
    // estimate mean luminance of the texture itself
    const small = await decodeRGB(t.getImage(), 64)
    let s = 0
    for (let i = 0; i < small.data.length; i += 3) s += luma(small.data[i] / 255, small.data[i + 1] / 255, small.data[i + 2] / 255)
    meanL = s / (small.data.length / 3)
  }
  const img = await neutralise(t.getImage(), meanL)
  const nt = doc.createTexture(`${mat.getName()}_tintable`).setImage(new Uint8Array(img)).setMimeType('image/jpeg')
  const info = mat.getBaseColorTextureInfo()
  const texCoord = info.getTexCoord()
  const transform = info.getExtension('KHR_texture_transform')
  mat.setBaseColorTexture(nt)
  mat.getBaseColorTextureInfo().setTexCoord(texCoord)
  if (transform) mat.getBaseColorTextureInfo().setExtension('KHR_texture_transform', transform.clone())
}

// ---------- main ----------
await fs.mkdir(outDir, { recursive: true })
const meta = {}
const metaPath = path.join(here, 'models.meta.json')
try {
  Object.assign(meta, JSON.parse(await fs.readFile(metaPath, 'utf8')))
} catch {
  /* first run */
}

for (const m of models) {
  if (only && !only.includes(m.slug)) continue
  console.log(`\n${m.slug}  <-  ${m.source}:${m.id}`)
  const src = path.join(rawDir, m.id, `${m.id}.${m.source === 'khronos' ? 'glb' : 'gltf'}`)
  const doc = await io.read(src)
  const rootP = doc.getRoot()

  // 1. clean-up
  for (const ext of rootP.listExtensionsUsed()) {
    if (['KHR_materials_variants', 'KHR_lights_punctual'].includes(ext.extensionName)) ext.dispose()
  }
  for (const n of rootP.listNodes()) {
    if (m.removeNodes && m.removeNodes.test(n.getName())) n.dispose()
    else if (m.closeDoors && m.closeDoors.test(n.getName())) n.setRotation([0, 0, 0, 1])
  }
  await doc.transform(prune())
  for (const mat of rootP.listMaterials()) {
    if (m.rename?.[mat.getName()]) mat.setName(m.rename[mat.getName()])
  }

  // 2. flatten + bake transforms (and the per-model orientation / depth fix)
  await doc.transform(flatten())
  const G = globalMatrix(m.rotateY ?? 0, m.scale ?? [1, 1, 1])
  for (const n of rootP.listNodes()) {
    if (!n.getMesh()) continue
    n.setMatrix(mul(G, n.getMatrix()))
    clearNodeTransform(n)
  }

  // 3. tint material
  const rule = m.tint
  let tintMat
  let meanL
  if (rule.keep) {
    const res = await splitByIsland(doc, rule, getBounds(rootP.listScenes()[0]))
    tintMat = res.tintMat
    meanL = res.meanL
  } else if (m.source === 'polyhaven') {
    tintMat = rootP.listMaterials()[0].setName(rule.material)
  } else {
    tintMat = rootP.listMaterials().find((x) => x.getName() === rule.material)
  }
  if (!tintMat) throw new Error(`tint material ${rule.material} not found`)
  if (rule.neutralise) await applyNeutralise(doc, tintMat, meanL)
  const lin = hexToLinear(rule.defaultColor)
  tintMat.setBaseColorFactor([...lin, 1])
  const sheen = tintMat.getExtension('KHR_materials_sheen')
  if (sheen) sheen.setSheenColorFactor(lin.map((c) => Math.min(1, c * 1.6 + 0.08)))

  // 4-6. optimise
  await doc.transform(
    dedup(),
    join(),
    weld(),
    // keepAttributes: KHR_texture_transform can point a texture at TEXCOORD_1, which prune would drop
    prune({ keepLeaves: false, keepAttributes: true }),
    center({ pivot: 'below' }),
    textureCompress({
      encoder: sharp,
      resize: [m.maxTexture, m.maxTexture],
      ...(useWebp ? { targetFormat: 'webp' } : {}),
      quality: 82,
    }),
  )
  if (!useWebp) {
    // Re-encode opaque PNGs (Khronos sources) as JPEG; keep PNG only where alpha is present.
    for (const t of rootP.listTextures()) {
      if (t.getMimeType() !== 'image/png') continue
      const md = await sharp(t.getImage()).stats()
      const hasAlpha = !md.isOpaque
      if (hasAlpha) continue
      const jpg = await sharp(t.getImage()).jpeg({ quality: 85 }).toBuffer()
      t.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg')
      if (t.getURI()) t.setURI(t.getURI().replace(/\.png$/i, '.jpg'))
    }
  }
  // Safety net: drop texture bindings whose UV set (incl. a KHR_texture_transform override) is
  // missing on a primitive using that material (seen on SheenChair's metal AO after joining).
  for (const prim of rootP.listMeshes().flatMap((me) => me.listPrimitives())) {
    const mat = prim.getMaterial()
    if (!mat) continue
    for (const slot of ['BaseColor', 'Normal', 'Occlusion', 'Emissive', 'MetallicRoughness']) {
      const info = mat[`get${slot}TextureInfo`]?.()
      if (!info || !mat[`get${slot}Texture`]()) continue
      const tt = info.getExtension('KHR_texture_transform')
      const set = tt?.getTexCoord() ?? info.getTexCoord()
      if (set != null && !prim.getAttribute(`TEXCOORD_${set}`)) {
        console.log(`   ! ${mat.getName()}: ${slot} texture needs TEXCOORD_${set}; binding removed`)
        mat[`set${slot}Texture`](null)
      }
    }
  }
  await doc.transform(prune(), draco({ method: 'edgebreaker' }))

  const out = path.join(outDir, `${m.slug}.glb`)
  await io.write(out, doc)

  // measure the written file
  const check = await io.read(out)
  const b = getBounds(check.getRoot().listScenes()[0])
  const cm = (i) => Math.round((b.max[i] - b.min[i]) * 1000) / 10
  const stat = await fs.stat(out)
  meta[m.slug] = {
    glb: `/models/${m.slug}.glb`,
    bytes: stat.size,
    native: { w: cm(0), h: cm(1), d: cm(2) },
    min: b.min.map((v) => +v.toFixed(3)),
    max: b.max.map((v) => +v.toFixed(3)),
    materials: check.getRoot().listMaterials().map((x) => x.getName()),
    tintMaterials: [rule.material],
    triangles: check
      .getRoot()
      .listMeshes()
      .flatMap((me) => me.listPrimitives())
      .reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0),
  }
  console.log(
    `   -> ${path.relative(root, out)}  ${(stat.size / 1024 / 1024).toFixed(2)} MB  ` +
      `native ${meta[m.slug].native.w} x ${meta[m.slug].native.d} x ${meta[m.slug].native.h} cm (w x d x h)  ` +
      `materials ${meta[m.slug].materials.join(', ')}`,
  )
}

await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n')
const total = Object.values(meta).reduce((s, x) => s + x.bytes, 0)
console.log(`\nTotal ${(total / 1024 / 1024).toFixed(2)} MB across ${Object.keys(meta).length} models`)
