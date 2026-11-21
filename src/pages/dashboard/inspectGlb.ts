import { Box3, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

export interface GlbInfo {
  /** Bounding box in cm (w = x, h = y, d = z). */
  size: { w: number; d: number; h: number }
  materials: string[]
  triangles: number
}

/** Reads a GLB in the browser: real-world size, material names, triangle count. */
export async function inspectGlb(file: File): Promise<GlbInfo> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  const buffer = await file.arrayBuffer()
  const gltf = await loader.parseAsync(buffer, '')
  const box = new Box3().setFromObject(gltf.scene)
  const v = box.getSize(new Vector3())
  const materials = new Set<string>()
  let triangles = 0
  gltf.scene.traverse((o) => {
    if (o instanceof Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      mats.forEach((m) => materials.add(m.name))
      const g = o.geometry
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3
    }
  })
  draco.dispose()
  return { size: { w: v.x * 100, h: v.y * 100, d: v.z * 100 }, materials: [...materials], triangles: Math.round(triangles) }
}
