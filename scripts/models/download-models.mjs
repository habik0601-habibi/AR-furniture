#!/usr/bin/env node
/**
 * Downloads the raw source models listed in models.config.mjs into scripts/models/raw/.
 *   node scripts/models/download-models.mjs
 * Poly Haven: glTF + textures via https://api.polyhaven.com/files/<id>
 * Khronos:    GLB from KhronosGroup/glTF-Sample-Assets (main branch)
 * Already-downloaded files are skipped.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { models } from './models.config.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const rawDir = path.join(here, 'raw')
const UA = { 'User-Agent': 'roomsense-model-build' }

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function download(url, dest) {
  if (await exists(dest)) return
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()))
  console.log('  ↓', path.relative(rawDir, dest))
}

for (const m of models) {
  console.log(`${m.slug} (${m.source}:${m.id})`)
  const dir = path.join(rawDir, m.id)
  if (m.source === 'polyhaven') {
    const res = await fetch(`https://api.polyhaven.com/files/${m.id}`, { headers: UA })
    if (!res.ok) throw new Error(`Poly Haven files API ${res.status} for ${m.id}`)
    const files = await res.json()
    const entry = files.gltf[m.res ?? '1k']?.gltf
    if (!entry) throw new Error(`No gltf ${m.res} for ${m.id}`)
    await download(entry.url, path.join(dir, `${m.id}.gltf`))
    for (const [rel, inc] of Object.entries(entry.include)) {
      await download(inc.url, path.join(dir, rel))
    }
  } else if (m.source === 'khronos') {
    const url = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/${m.id}/glTF-Binary/${m.id}.glb`
    await download(url, path.join(dir, `${m.id}.glb`))
  }
}
console.log('done')
