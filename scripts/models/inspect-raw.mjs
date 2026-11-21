// Prints bounds, materials and textures of the raw source models (for picking tint materials).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { models } from './models.config.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const m of models) {
  const file = path.join(here, 'raw', m.id, `${m.id}.${m.source === 'khronos' ? 'glb' : 'gltf'}`)
  const doc = await io.read(file)
  const root = doc.getRoot()
  const b = getBounds(root.listScenes()[0])
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3))
  console.log(`\n${m.slug} ${m.id} size(m)=${size} min=${b.min.map(v=>+v.toFixed(3))} max=${b.max.map(v=>+v.toFixed(3))}`)
  console.log(' meshes', root.listMeshes().length, 'nodes', root.listNodes().length, 'exts', root.listExtensionsUsed().map(e=>e.extensionName).join(','))
  for (const mat of root.listMaterials()) {
    const t = mat.getBaseColorTexture()
    console.log('  mat', JSON.stringify(mat.getName()), 'base', mat.getBaseColorFactor().map(v=>+v.toFixed(2)), 'tex', t ? `${t.getURI() || t.getName()} ${t.getSize()}` : '-', 'metal', mat.getMetallicFactor())
  }
  for (const n of root.listNodes()) if (n.getMesh()) console.log('  node', n.getName(), 'prims', n.getMesh().listPrimitives().map(p=>p.getMaterial()?.getName()).join('|'))
}
