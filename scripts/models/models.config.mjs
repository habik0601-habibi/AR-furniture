/**
 * Source list and per-model build rules for the RoomSense demo catalogue.
 * Every entry's licence was checked by hand (see src/data/credits.md):
 *  - Poly Haven: all assets CC0 (https://polyhaven.com/license)
 *  - Khronos glTF-Sample-Assets: licence per model in its metadata.json
 *
 * Fields
 *  slug        output file: public/models/<slug>.glb
 *  maxTexture  texture size cap (2048 only for hero items)
 *  rotateY     degrees about +Y, applied so the model's front faces +Z
 *  scale       [x, y, z] factor baked into the geometry (only used to fix an unrealistic depth)
 *  closeDoors  regex: nodes whose rotation is reset (the source poses its doors ajar)
 *  removeNodes regex: nodes deleted (e.g. a product label under a seat)
 *  rename      { sourceMaterialName: newName } for models that already have separate materials
 *  tint        how the "finish" material is produced:
 *    material     name of the final tintable material (what catalog.ts lists in tintMaterials)
 *    keep         name for the untinted remainder (Poly Haven models have one atlas material)
 *    classify     (px) => boolean; px = { r, g, b, h, s, v, l, y } (sRGB 0..1, hue 0..360,
 *                 y = triangle height 0..1 within the model). Votes are taken per triangle and
 *                 decided per connected island, so every UV island goes wholly to one side.
 *                 Omit to make the whole material tintable.
 *    neutralise   replace the tint material's base-colour texture with a light greyscale copy
 *                 (keeps grain / weave detail, so the finish colour multiplies cleanly)
 *    defaultColor sRGB hex baked in as the tint material's base colour, so the GLB looks like
 *                 the catalogue's first finish even where nothing re-tints it
 */
const isWarm = (p) => p.r > p.b * 1.15

export const models = [
  {
    slug: 'sofa-velvet',
    source: 'khronos',
    id: 'GlamVelvetSofa',
    maxTexture: 2048,
    rename: {
      GlamVelvetSofa_fabric_navy: 'Fabric',
      GlamVelvetSofa_legs: 'Legs',
      GlamVelvetSofa_feet: 'Feet',
    },
    tint: { material: 'Fabric', defaultColor: '#1f3a5f', sheen: true },
  },
  {
    slug: 'sofa-classic',
    source: 'polyhaven',
    id: 'Sofa_01',
    res: '2k',
    maxTexture: 2048,
    tint: {
      material: 'Fabric',
      keep: 'Frame',
      classify: (p) => p.l > 0.33 && p.s < 0.3,
      neutralise: true,
      defaultColor: '#e8e0d2',
    },
  },
  {
    slug: 'sofa-chesterfield',
    source: 'polyhaven',
    id: 'sofa_02',
    res: '2k',
    maxTexture: 1024,
    tint: {
      material: 'Leather',
      keep: 'Frame',
      classify: (p) => !(p.r > p.g * 1.3 && p.r > 0.1),
      neutralise: true,
      defaultColor: '#7a4a2e',
    },
  },
  {
    slug: 'armchair-tufted',
    source: 'khronos',
    id: 'SheenChair',
    maxTexture: 1024,
    removeNodes: /label/i,
    rename: { 'fabric Mystere Mango Velvet': 'Fabric', 'wood Brown': 'Wood', metal: 'Metal' },
    tint: { material: 'Fabric', neutralise: true, defaultColor: '#c9a227', sheen: true },
  },
  {
    slug: 'armchair-classic',
    source: 'polyhaven',
    id: 'ArmChair_01',
    res: '2k',
    maxTexture: 1024,
    tint: {
      material: 'Fabric',
      keep: 'Frame',
      classify: (p) => p.l > 0.33 && p.s < 0.3,
      neutralise: true,
      defaultColor: '#d9d4cb',
    },
  },
  {
    slug: 'bed-carved',
    source: 'polyhaven',
    id: 'GothicBed_01',
    res: '2k',
    maxTexture: 1024,
    tint: {
      material: 'Wood',
      keep: 'Bedding',
      classify: (p) => !(p.s < 0.2 && p.v > 0.45),
      neutralise: true,
      defaultColor: '#8a5a3b',
    },
  },
  {
    slug: 'wardrobe-carved',
    source: 'polyhaven',
    id: 'GothicCabinet_01',
    res: '2k',
    maxTexture: 1024,
    closeDoors: /door/i,
    // The source cabinet is ~102 cm deep; bake it to a realistic wardrobe depth (~61 cm).
    scale: [1, 1, 0.6],
    tint: { material: 'Wood', keep: 'Hardware', classify: isWarm, neutralise: true, defaultColor: '#8a5a3b' },
  },
  {
    slug: 'dresser-carved',
    source: 'polyhaven',
    id: 'GothicCommode_01',
    res: '2k',
    maxTexture: 1024,
    tint: { material: 'Wood', neutralise: true, defaultColor: '#8a5a3b' },
  },
  {
    slug: 'dining-table-round',
    source: 'polyhaven',
    id: 'round_wooden_table_01',
    res: '2k',
    maxTexture: 1024,
    // The source is bar height (~100 cm); bake it to dining height (~76 cm).
    scale: [1, 0.76, 1],
    tint: { material: 'Wood', neutralise: true, defaultColor: '#6b4430' },
  },
  {
    slug: 'dining-chair-tufted',
    source: 'polyhaven',
    id: 'dining_chair_02',
    res: '2k',
    maxTexture: 1024,
    tint: {
      material: 'Upholstery',
      keep: 'Legs',
      classify: (p) => p.y > 0.42 || (p.l > 0.1 && p.y > 0.3),
      neutralise: true,
      defaultColor: '#6b4a3a',
    },
  },
  {
    slug: 'coffee-table-modern',
    source: 'polyhaven',
    id: 'modern_coffee_table_01',
    res: '2k',
    maxTexture: 1024,
    rotateY: 90,
    tint: {
      material: 'Wood',
      keep: 'Top',
      classify: (p) => p.s > 0.25 && p.h > 10 && p.h < 55,
      neutralise: true,
      defaultColor: '#b98a5a',
    },
  },
  {
    slug: 'tv-unit-slatted',
    source: 'polyhaven',
    id: 'modern_wooden_cabinet',
    res: '2k',
    maxTexture: 1024,
    tint: {
      material: 'Wood',
      keep: 'Metal',
      classify: (p) => p.v > 0.12 && p.s > 0.2,
      neutralise: true,
      defaultColor: '#5c3b28',
    },
  },
  {
    slug: 'side-table-oak',
    source: 'polyhaven',
    id: 'side_table_01',
    res: '2k',
    maxTexture: 1024,
    tint: { material: 'Wood', keep: 'Hardware', classify: (p) => p.s > 0.25, neutralise: true, defaultColor: '#c49a6c' },
  },
  {
    slug: 'bookshelf-cube',
    source: 'polyhaven',
    id: 'wooden_display_shelves_01',
    res: '2k',
    maxTexture: 1024,
    rotateY: 90,
    tint: { material: 'Wood', keep: 'Bins', classify: (p) => p.s > 0.2, neutralise: true, defaultColor: '#c49a6c' },
  },
  {
    slug: 'desk-office',
    source: 'polyhaven',
    id: 'metal_office_desk',
    res: '2k',
    maxTexture: 1024,
    tint: { material: 'Body', keep: 'Top', classify: (p) => p.l < 0.45, neutralise: true, defaultColor: '#5b6168' },
  },
]
