/**
 * Demo catalogue of a fictional Pakistani furniture brand.
 *
 * The 3D models are real third-party assets (see ./credits.md). The names, prices,
 * descriptions and finishes are invented for the demo. Every GLB was built by
 * scripts/models/build-models.mjs: Y-up, front faces +Z, origin at the floor centre, metres.
 * `model.native` is the measured bounding box of the built GLB in cm.
 * Hotspot positions are in the GLB's own (unscaled) space. ProductViewer scales them with the
 * selected size.
 */
import type { Category, Dimensions } from '../engine/types'
import type { Credit, Finish, Product } from './types'

// ---------- shared helpers ----------

const d = (w: number, dd: number, h: number): Dimensions => ({ w, d: dd, h })

const POLY_HAVEN_LICENSE = 'CC0 1.0'
const polyHaven = (title: string, author: string, id: string): Credit => ({
  title,
  author,
  license: POLY_HAVEN_LICENSE,
  url: `https://polyhaven.com/a/${id}`,
})

const finish = (id: string, name: string, kind: Finish['kind'], color: string, priceDelta = 0): Finish => ({
  id,
  name,
  kind,
  color,
  priceDelta,
})

// ---------- catalogue ----------

export const catalog: Product[] = [
  {
    id: 'sofa-noor',
    slug: 'noor-curved-velvet-sofa',
    name: 'Noor Curved Velvet Sofa',
    category: 'sofa',
    description:
      'A sculpted, curved three-seater with a deep seat and slim tapered metal legs. Upholstered in soft velvet over a solid hardwood frame, it makes a strong centrepiece for a drawing room.',
    sizes: [
      { id: '3s', label: '3-Seater (219 cm)', dims: d(219, 102, 79), price: 225000, packed: d(229, 110, 85), weightKg: 68 },
      { id: '3s-compact', label: 'Compact 3-Seater (190 cm)', dims: d(190, 102, 79), price: 198000, packed: d(200, 110, 85), weightKg: 60 },
      { id: '4s', label: '4-Seater (250 cm)', dims: d(250, 102, 79), price: 255000, packed: d(260, 110, 85), weightKg: 78 },
    ],
    finishes: [
      finish('navy-velvet', 'Navy Velvet', 'velvet', '#1f3a5f'),
      finish('emerald-velvet', 'Emerald Velvet', 'velvet', '#1f5c45'),
      finish('mustard-velvet', 'Mustard Velvet', 'velvet', '#c9a227'),
      finish('charcoal-velvet', 'Charcoal Velvet', 'velvet', '#3b3b3d'),
      finish('blush-velvet', 'Blush Velvet', 'velvet', '#c98f8f', 8000),
      finish('champagne-velvet', 'Champagne Velvet', 'velvet', '#cdb894', 12000),
    ],
    model: {
      glb: '/models/sofa-velvet.glb',
      native: d(218.8, 102.3, 78.8),
      tintMaterials: ['Fabric'],
    },
    hotspots: [
      { id: 'seat', label: 'Deep seat', detail: 'High-resilience foam seat wrapped in fibre, around 60 cm of usable depth.', position: '-0.4 0.452 0.15', normal: '0 1 0' },
      { id: 'back', label: 'Curved backrest', detail: 'The back follows the curve of the seat, so everyone gets the same support.', position: '0.2 0.662 -0.35', normal: '0 1 0' },
      { id: 'arm', label: 'Single sculpted arm', detail: 'Open on one end so it sits well in a corner or in front of a window.', position: '1.032 0.5 -0.1', normal: '1 0 0' },
      { id: 'legs', label: 'Metal legs', detail: 'Powder-coated steel legs with brass-tone caps. They unscrew for delivery.', position: '-0.765 0.12 0.493', normal: '0 0 1' },
    ],
    styles: ['modern', 'minimal'],
    assemblyRequired: false,
    removableLegs: true,
    leadDays: 21,
    credit: {
      title: 'Glam Velvet Sofa',
      author: 'Eric Chadwick, © 2021 Wayfair, LLC',
      license: 'CC BY 4.0',
      url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa',
    },
  },
  {
    id: 'sofa-shalimar',
    slug: 'shalimar-carved-loveseat',
    name: 'Shalimar Carved Loveseat',
    category: 'sofa',
    description:
      'A classic two-seater with a hand-finished carved wooden frame and a softly scalloped back. The loose seat cushions are filled with high-density foam, so it suits formal sitting rooms.',
    sizes: [
      { id: '2s', label: '2-Seater (157 cm)', dims: d(157, 66, 80), price: 145000, packed: d(167, 75, 88), weightKg: 52 },
      { id: 'settee', label: 'Settee (140 cm)', dims: d(140, 66, 80), price: 128000, packed: d(150, 75, 88), weightKg: 46 },
      { id: '2-5s', label: '2.5-Seater (180 cm)', dims: d(180, 66, 80), price: 165000, packed: d(190, 75, 88), weightKg: 60 },
    ],
    finishes: [
      finish('ivory-linen', 'Ivory Linen', 'fabric', '#e8e0d2'),
      finish('charcoal-weave', 'Charcoal Weave', 'fabric', '#4a4a4c'),
      finish('mustard', 'Mustard', 'fabric', '#c9a227'),
      finish('dusty-rose', 'Dusty Rose', 'fabric', '#c49a9a'),
      finish('teal', 'Deep Teal', 'fabric', '#2f6f73'),
      finish('emerald-velvet', 'Emerald Velvet', 'velvet', '#1f5c45', 12000),
    ],
    model: {
      glb: '/models/sofa-classic.glb',
      native: d(157.1, 65.8, 79.7),
      tintMaterials: ['Fabric'],
    },
    hotspots: [
      { id: 'cushion', label: 'Seat cushions', detail: 'High-density foam cushions with removable, zipped covers.', position: '-0.35 0.38 0.1', normal: '0 1 0' },
      { id: 'crest', label: 'Carved crest rail', detail: 'The scalloped top rail is carved and hand-polished.', position: '0 0.736 -0.25', normal: '0 1 0' },
      { id: 'arm', label: 'Padded arms', detail: 'Upholstered armrests with exposed wooden scroll ends.', position: '0.7 0.453 0', normal: '0 1 0' },
      { id: 'apron', label: 'Solid wood apron', detail: 'Kiln-dried hardwood frame with a carved front apron and cabriole legs.', position: '0 0.12 0.326', normal: '0 0 1' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: false,
    removableLegs: false,
    leadDays: 28,
    credit: polyHaven('Sofa 01', 'Kirill Sannikov', 'Sofa_01'),
  },
  {
    id: 'sofa-kohsar',
    slug: 'kohsar-chesterfield-sofa',
    name: 'Kohsar Chesterfield Sofa',
    category: 'sofa',
    description:
      'A deep-buttoned Chesterfield with rolled arms and a polished wooden base. It is covered in a durable leatherette that wipes clean, which suits busy family lounges.',
    sizes: [
      { id: '3s', label: '3-Seater (181 cm)', dims: d(181, 82, 71), price: 185000, packed: d(191, 90, 80), weightKg: 64 },
      { id: '2s', label: '2-Seater (155 cm)', dims: d(155, 82, 71), price: 158000, packed: d(165, 90, 80), weightKg: 54 },
      { id: '3s-large', label: 'Large 3-Seater (205 cm)', dims: d(205, 82, 71), price: 210000, packed: d(215, 90, 80), weightKg: 72 },
    ],
    finishes: [
      finish('cognac', 'Cognac', 'leather', '#7a4a2e'),
      finish('black', 'Jet Black', 'leather', '#1e1e1e'),
      finish('tan', 'Saddle Tan', 'leather', '#a8754a', 6000),
      finish('oxblood', 'Oxblood', 'leather', '#5a1f1f', 12000),
      finish('bottle-green', 'Bottle Green', 'leather', '#2e4a3a', 12000),
    ],
    model: {
      glb: '/models/sofa-chesterfield.glb',
      native: d(180.7, 81.8, 70.9),
      tintMaterials: ['Leather'],
    },
    hotspots: [
      { id: 'tufting', label: 'Deep buttoning', detail: 'Hand-pleated diamond tufting across the back and arms.', position: '0 0.701 -0.3', normal: '0 1 0' },
      { id: 'arm', label: 'Rolled arms', detail: 'Arms at the same height as the back give the classic Chesterfield outline.', position: '0.8 0.659 0', normal: '0 1 0' },
      { id: 'seat', label: 'Sprung seat', detail: 'Zig-zag springs under a foam seat cushion keep it supportive over the years.', position: '0 0.3 0.407', normal: '0 0 1' },
      { id: 'base', label: 'Wooden base', detail: 'Polished wooden plinth and feet.', position: '0.794 0.05 0.388', normal: '0 0 1' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: false,
    removableLegs: false,
    leadDays: 25,
    credit: polyHaven('Sofa 02', 'Kirill Sannikov', 'sofa_02'),
  },
  {
    id: 'armchair-hunza',
    slug: 'hunza-tufted-lounge-chair',
    name: 'Hunza Tufted Lounge Chair',
    category: 'armchair',
    description:
      'A low, armless lounge chair with a curved, button-tufted seat and back on angled wooden legs. Its small footprint suits bedrooms, reading corners and smaller flats.',
    sizes: [
      { id: 'std', label: 'Standard (83 cm)', dims: d(83, 57, 69), price: 48000, packed: d(90, 64, 76), weightKg: 18 },
      { id: 'wide', label: 'Wide (95 cm)', dims: d(95, 57, 69), price: 56000, packed: d(102, 64, 76), weightKg: 21 },
    ],
    finishes: [
      finish('mustard-velvet', 'Mustard Velvet', 'velvet', '#c9a227'),
      finish('rust-velvet', 'Rust Velvet', 'velvet', '#b5532a'),
      finish('peacock-velvet', 'Peacock Velvet', 'velvet', '#1f5f63'),
      finish('blush-velvet', 'Blush Velvet', 'velvet', '#c98f8f'),
      finish('ivory-boucle', 'Ivory Boucle', 'fabric', '#e6e0d4', 4000),
    ],
    model: {
      glb: '/models/armchair-tufted.glb',
      native: d(82.7, 57, 68.6),
      tintMaterials: ['Fabric'],
    },
    hotspots: [
      { id: 'seat', label: 'Tufted seat', detail: 'Fabric-covered buttons hold the foam in place so the seat keeps its shape.', position: '0 0.358 0.05', normal: '0 1 0' },
      { id: 'back', label: 'Curved back', detail: 'The back panel curves gently around the shoulders.', position: '0 0.55 -0.142', normal: '0 0 1' },
      { id: 'legs', label: 'Hardwood legs', detail: 'Angled solid wood legs with metal brackets. They bolt on after delivery.', position: '0.331 0.15 0.203', normal: '0 0 1' },
    ],
    styles: ['modern', 'scandinavian'],
    assemblyRequired: false,
    removableLegs: true,
    leadDays: 14,
    credit: {
      title: 'Sheen Chair',
      author: 'Eric Chadwick, Wayfair, LLC',
      license: 'CC0 1.0',
      url: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair',
    },
  },
  {
    id: 'armchair-anarkali',
    slug: 'anarkali-carved-armchair',
    name: 'Anarkali Carved Armchair',
    category: 'armchair',
    description:
      'A tub-shaped armchair with a carved, dark-polished wooden frame and a fully upholstered back. It pairs with the Shalimar loveseat for a matching formal set.',
    sizes: [
      { id: 'std', label: 'Standard (85 cm)', dims: d(85, 77, 107), price: 68000, packed: d(92, 84, 114), weightKg: 24 },
      { id: 'large', label: 'Large (95 cm)', dims: d(95, 77, 107), price: 76000, packed: d(102, 84, 114), weightKg: 27 },
    ],
    finishes: [
      finish('ivory-linen', 'Ivory Linen', 'fabric', '#d9d4cb'),
      finish('charcoal-weave', 'Charcoal Weave', 'fabric', '#4a4a4c'),
      finish('mustard', 'Mustard', 'fabric', '#c9a227'),
      finish('dusty-rose', 'Dusty Rose', 'fabric', '#c49a9a'),
      finish('teal', 'Deep Teal', 'fabric', '#2f6f73'),
      finish('emerald-velvet', 'Emerald Velvet', 'velvet', '#1f5c45', 6000),
    ],
    model: {
      glb: '/models/armchair-classic.glb',
      native: d(84.8, 76.6, 106.5),
      tintMaterials: ['Fabric'],
    },
    hotspots: [
      { id: 'seat', label: 'Cushioned seat', detail: 'A sprung base under a high-resilience foam cushion.', position: '0 0.496 0.05', normal: '0 1 0' },
      { id: 'back', label: 'Tub back', detail: 'The rounded back wraps around you for upright, supported sitting.', position: '0 0.8 -0.283', normal: '0 0 1' },
      { id: 'arm', label: 'Padded armrests', detail: 'Upholstered arm pads set into the carved frame.', position: '0.36 0.683 0.05', normal: '0 1 0' },
      { id: 'leg', label: 'Carved legs', detail: 'Solid hardwood cabriole legs with a hand-rubbed polish.', position: '0.403 0.08 0.36', normal: '0 0 1' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: false,
    removableLegs: false,
    leadDays: 21,
    credit: polyHaven('Arm Chair 01', 'Kirill Sannikov', 'ArmChair_01'),
  },
  {
    id: 'bed-margalla',
    slug: 'margalla-carved-bed',
    name: 'Margalla Carved Bed',
    category: 'bed',
    description:
      'A tall four-post bed with a pierced, carved headboard and footboard in solid wood. The slatted base takes a standard mattress, which is sold separately.',
    sizes: [
      { id: 'queen', label: 'Queen (5 × 6.5 ft mattress)', dims: d(150, 204, 153), price: 165000, packed: d(165, 22, 162), weightKg: 115 },
      { id: 'double', label: 'Double (4.5 × 6.5 ft mattress)', dims: d(137, 204, 153), price: 148000, packed: d(152, 22, 162), weightKg: 105 },
      { id: 'king', label: 'King (6 × 6.5 ft mattress)', dims: d(180, 204, 153), price: 199000, packed: d(195, 22, 162), weightKg: 132 },
    ],
    finishes: [
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('walnut', 'Walnut', 'wood', '#5a3d2b', 8000),
      finish('mahogany', 'Mahogany', 'wood', '#6b2e1f', 8000),
      finish('teak', 'Natural Teak', 'wood', '#b07a4a', 12000),
      finish('ebony', 'Ebony Stain', 'wood', '#2b211c', 10000),
      finish('antique-white', 'Antique White', 'wood', '#e9e2d4', 18000),
    ],
    model: {
      glb: '/models/bed-carved.glb',
      native: d(149.4, 204, 153.4),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'headboard', label: 'Carved headboard', detail: 'Pierced tracery panels carved from solid wood.', position: '0.4 1.055 -0.98', normal: '0 1 0' },
      { id: 'mattress', label: 'Slatted base', detail: 'Solid wood slats on a centre rail. Fits a 6.5 ft mattress up to about 25 cm thick (not included).', position: '0 0.436 0.6', normal: '0 1 0' },
      { id: 'footboard', label: 'Footboard', detail: 'A matching carved footboard, bolted to the side rails.', position: '0 0.5 0.985', normal: '0 0 1' },
      { id: 'rail', label: 'Side rails', detail: 'The rails bolt to the posts, so the bed comes apart for moving.', position: '0.699 0.3 0', normal: '1 0 0' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: true,
    removableLegs: false,
    leadDays: 30,
    credit: polyHaven('Gothic Bed 01', 'Kirill Sannikov', 'GothicBed_01'),
  },
  {
    id: 'wardrobe-khyber',
    slug: 'khyber-carved-wardrobe',
    name: 'Khyber Carved Wardrobe',
    category: 'wardrobe',
    description:
      'A tall four-door wardrobe with carved door panels and black iron strap hinges. Inside it has hanging space at the top and shelves below.',
    sizes: [
      { id: '4d', label: '4-Door (172 cm)', dims: d(172, 61, 236), price: 215000, packed: d(245, 66, 18), weightKg: 160 },
      { id: '4d-narrow', label: 'Narrow 4-Door (150 cm)', dims: d(150, 61, 236), price: 189000, packed: d(245, 66, 18), weightKg: 142 },
    ],
    finishes: [
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('walnut', 'Walnut', 'wood', '#5a3d2b', 10000),
      finish('mahogany', 'Mahogany', 'wood', '#6b2e1f', 10000),
      finish('teak', 'Natural Teak', 'wood', '#b07a4a', 15000),
      finish('ebony', 'Ebony Stain', 'wood', '#2b211c', 12000),
    ],
    model: {
      glb: '/models/wardrobe-carved.glb',
      native: d(171.9, 60.9, 236.1),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'upper', label: 'Hanging section', detail: 'The upper doors open onto a full-width hanging rail.', position: '-0.35 1.75 0.225', normal: '0 0 1' },
      { id: 'lower', label: 'Shelved section', detail: 'The lower doors hide adjustable shelves for folded clothes.', position: '0.35 0.75 0.225', normal: '0 0 1' },
      { id: 'hinges', label: 'Iron strap hinges', detail: 'Black-finished decorative hinges and lockable door pulls.', position: '0.05 1.2 0.244', normal: '0 0 1' },
      { id: 'crown', label: 'Crown moulding', detail: 'A moulded cornice finishes the top. It comes off for tight stairwells.', position: '0.55 2.3 0.26', normal: '0 0 1' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: true,
    removableLegs: false,
    leadDays: 35,
    credit: polyHaven('Gothic Cabinet 01', 'Kirill Sannikov', 'GothicCabinet_01'),
  },
  {
    id: 'dresser-chiniot',
    slug: 'chiniot-chest-of-drawers',
    name: 'Chiniot Chest of Drawers',
    category: 'dresser',
    description:
      'A three-drawer chest with arched carving across the top drawer and turned wooden knobs. The drawers run on wooden runners and the top is wide enough for a mirror.',
    sizes: [
      { id: 'std', label: '3-Drawer (120 cm)', dims: d(120, 58, 121), price: 88000, packed: d(128, 66, 130), weightKg: 62 },
      { id: 'wide', label: 'Wide 3-Drawer (138 cm)', dims: d(138, 58, 121), price: 99000, packed: d(146, 66, 130), weightKg: 70 },
    ],
    finishes: [
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('walnut', 'Walnut', 'wood', '#5a3d2b', 5000),
      finish('mahogany', 'Mahogany', 'wood', '#6b2e1f', 5000),
      finish('teak', 'Natural Teak', 'wood', '#b07a4a', 8000),
      finish('antique-white', 'Antique White', 'wood', '#e9e2d4', 10000),
    ],
    model: {
      glb: '/models/dresser-carved.glb',
      native: d(120.1, 58.1, 121.2),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'top', label: 'Solid top', detail: 'A thick solid-wood top with a moulded edge.', position: '0.2 1.212 0', normal: '0 1 0' },
      { id: 'carving', label: 'Arched carving', detail: 'The top drawer front has hand-carved arches.', position: '0 0.97 0.225', normal: '0 0 1' },
      { id: 'drawer', label: 'Deep drawers', detail: 'Three full-width drawers on waxed wooden runners.', position: '0 0.35 0.235', normal: '0 0 1' },
      { id: 'feet', label: 'Bracket feet', detail: 'Bracket feet raise the chest off the floor so you can clean underneath.', position: '0.587 0.04 0.276', normal: '0 0 1' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: false,
    removableLegs: false,
    leadDays: 21,
    credit: polyHaven('Gothic Commode 01', 'Kirill Sannikov', 'GothicCommode_01'),
  },
  {
    id: 'dining-kaghan',
    slug: 'kaghan-round-dining-table',
    name: 'Kaghan Round Dining Table',
    category: 'dining_table',
    description:
      'A round pedestal dining table with a turned column and four splayed feet, so there are no corner legs in the way of chairs. Its polished top is sealed against everyday spills.',
    sizes: [
      { id: '6s', label: '6-Seater (140 cm)', dims: d(140, 140, 76), price: 98000, packed: d(148, 148, 14), weightKg: 58 },
      { id: '4s', label: '4-Seater (120 cm)', dims: d(120, 120, 76), price: 82000, packed: d(128, 128, 14), weightKg: 48 },
      { id: '8s', label: '8-Seater (160 cm)', dims: d(160, 160, 76), price: 118000, packed: d(168, 168, 14), weightKg: 70 },
    ],
    finishes: [
      finish('walnut', 'Walnut', 'wood', '#6b4430'),
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('natural-oak', 'Natural Oak', 'wood', '#c9a77c', 6000),
      finish('mahogany', 'Mahogany', 'wood', '#6b2e1f', 6000),
      finish('ebony', 'Ebony Stain', 'wood', '#2b211c', 8000),
    ],
    model: {
      glb: '/models/dining-table-round.glb',
      native: d(139.9, 139.9, 76.4),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'top', label: 'Sealed top', detail: 'A lacquered solid-wood top that resists heat marks and spills.', position: '0.3 0.764 0.2', normal: '0 1 0' },
      { id: 'edge', label: 'Rounded edge', detail: 'A softened edge, comfortable to lean on and safer around children.', position: '0.699 0.74 0', normal: '1 0 0' },
      { id: 'pedestal', label: 'Turned pedestal', detail: 'A single central column leaves the most legroom around the table.', position: '0 0.45 0.075', normal: '0 0 1' },
      { id: 'feet', label: 'Splayed feet', detail: 'Four curved feet keep it stable. They bolt to the column.', position: '0.396 0.04 0.505', normal: '0 0 1' },
    ],
    styles: ['classic', 'traditional'],
    assemblyRequired: true,
    removableLegs: true,
    leadDays: 21,
    credit: polyHaven('Round Wooden Table 01', 'Ulan Cabanilla', 'round_wooden_table_01'),
  },
  {
    id: 'chair-saba',
    slug: 'saba-tufted-dining-chair',
    name: 'Saba Tufted Dining Chair',
    category: 'dining_chair',
    description:
      'A high-back dining chair with diamond tufting, a scrolled top and dark wooden legs. The upholstery is a wipe-clean leatherette, a sensible choice for family dining.',
    sizes: [
      { id: 'std', label: 'Standard (43 cm)', dims: d(43, 58, 97), price: 22000, packed: d(50, 65, 104), weightKg: 9 },
      { id: 'wide', label: 'Wide (50 cm)', dims: d(50, 58, 97), price: 26000, packed: d(57, 65, 104), weightKg: 10 },
    ],
    finishes: [
      finish('mocha', 'Mocha', 'leather', '#6b4a3a'),
      finish('charcoal', 'Charcoal', 'leather', '#3a3a3c'),
      finish('ivory', 'Ivory', 'leather', '#e6dfd2', 1500),
      finish('burgundy', 'Burgundy', 'leather', '#6e2233', 1500),
      finish('emerald-velvet', 'Emerald Velvet', 'velvet', '#1f5c45', 2500),
    ],
    model: {
      glb: '/models/dining-chair-tufted.glb',
      native: d(43.4, 57.6, 97.3),
      tintMaterials: ['Upholstery'],
    },
    hotspots: [
      { id: 'seat', label: 'Padded seat', detail: 'A firm foam seat at the standard 46 cm dining height.', position: '0 0.453 0.1', normal: '0 1 0' },
      { id: 'back', label: 'Tufted high back', detail: 'Diamond button-tufting with a scrolled top that doubles as a handle.', position: '0 0.7 -0.097', normal: '0 0 1' },
      { id: 'legs', label: 'Hardwood legs', detail: 'Solid wood legs in a dark stain, with floor protectors.', position: '0.173 0.1 0.254', normal: '0 0 1' },
    ],
    styles: ['classic', 'modern'],
    assemblyRequired: false,
    removableLegs: false,
    leadDays: 14,
    credit: polyHaven('Dining Chair 02', 'James Ray Cock', 'dining_chair_02'),
  },
  {
    id: 'coffee-ravi',
    slug: 'ravi-coffee-table',
    name: 'Ravi Coffee Table',
    category: 'coffee_table',
    description:
      'A low coffee table with a concrete-finish top, framed by wooden sled legs and inlaid corner chevrons. The open frame keeps it light-looking in smaller lounges.',
    sizes: [
      { id: 'std', label: 'Standard (120 cm)', dims: d(120, 60, 39), price: 38000, packed: d(128, 68, 18), weightKg: 26 },
      { id: 'compact', label: 'Compact (100 cm)', dims: d(100, 60, 39), price: 32000, packed: d(108, 68, 18), weightKg: 22 },
      { id: 'long', label: 'Long (140 cm)', dims: d(140, 60, 39), price: 45000, packed: d(148, 68, 18), weightKg: 30 },
    ],
    finishes: [
      finish('honey-oak', 'Honey Oak', 'wood', '#b98a5a'),
      finish('walnut', 'Walnut', 'wood', '#5a3d2b', 3000),
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('ebony', 'Ebony Stain', 'wood', '#3b2a20', 3500),
    ],
    model: {
      glb: '/models/coffee-table-modern.glb',
      native: d(120.2, 60, 39),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'top', label: 'Concrete-finish top', detail: 'A sealed cement-look surface that stays the same in every wood finish.', position: '0 0.39 0', normal: '0 1 0' },
      { id: 'inlay', label: 'Wood chevrons', detail: 'The corner inlays match the colour of the frame.', position: '0.5 0.39 0.2', normal: '0 1 0' },
      { id: 'legs', label: 'Sled legs', detail: 'Solid wood sled legs spread the weight on rugs and tiles.', position: '0.57 0.1 0.26', normal: '0 0 1' },
    ],
    styles: ['modern', 'industrial'],
    assemblyRequired: true,
    removableLegs: true,
    leadDays: 10,
    credit: polyHaven('Modern Coffee Table 01', 'Amin', 'modern_coffee_table_01'),
  },
  {
    id: 'tv-indus',
    slug: 'indus-slatted-tv-unit',
    name: 'Indus Slatted TV Unit',
    category: 'tv_unit',
    description:
      'A long, low media console with fluted wooden doors on slim black metal legs. There is room for a set-top box and router behind the doors, with cable cut-outs at the back.',
    sizes: [
      { id: '244', label: 'Wide (244 cm)', dims: d(244, 52, 68), price: 89000, packed: d(252, 58, 22), weightKg: 68 },
      { id: '200', label: 'Standard (200 cm)', dims: d(200, 52, 68), price: 76000, packed: d(208, 58, 22), weightKg: 57 },
    ],
    finishes: [
      finish('dark-walnut', 'Dark Walnut', 'wood', '#5c3b28'),
      finish('natural-oak', 'Natural Oak', 'wood', '#c9a77c'),
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('smoked-oak', 'Smoked Oak', 'wood', '#6e5a48', 4000),
      finish('white-ash', 'White Ash', 'wood', '#e3d9c6', 6000),
    ],
    model: {
      glb: '/models/tv-unit-slatted.glb',
      native: d(244, 52, 68),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'doors', label: 'Fluted doors', detail: 'Vertically slatted fronts with push-to-open hinges and no handles.', position: '-0.6 0.4 0.244', normal: '0 0 1' },
      { id: 'top', label: 'TV top', detail: 'Takes TVs up to about 85 inches on a stand. Load up to about 50 kg.', position: '0.8 0.68 0', normal: '0 1 0' },
      { id: 'legs', label: 'Metal legs', detail: 'Powder-coated steel legs with levelling feet.', position: '1.111 0.05 0.207', normal: '0 0 1' },
    ],
    styles: ['modern', 'minimal', 'scandinavian'],
    assemblyRequired: true,
    removableLegs: true,
    leadDays: 14,
    credit: polyHaven('Modern Wooden Cabinet', 'Patrik Pangerl', 'modern_wooden_cabinet'),
  },
  {
    id: 'side-swat',
    slug: 'swat-side-table',
    name: 'Swat Side Table',
    category: 'side_table',
    description:
      'A sturdy two-tier side table in solid wood with a lower shelf for books or a basket. It works as a bedside table or next to a sofa.',
    sizes: [
      { id: 'std', label: 'Standard (55 cm)', dims: d(55, 45, 55), price: 18500, packed: d(60, 50, 16), weightKg: 11 },
      { id: 'wide', label: 'Wide (65 cm)', dims: d(65, 45, 55), price: 22000, packed: d(70, 50, 16), weightKg: 13 },
    ],
    finishes: [
      finish('natural-oak', 'Natural Oak', 'wood', '#c49a6c'),
      finish('walnut', 'Walnut', 'wood', '#5a3d2b', 1500),
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('black-stain', 'Black Stain', 'wood', '#2b2622', 1500),
    ],
    model: {
      glb: '/models/side-table-oak.glb',
      native: d(55, 45, 55.1),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'top', label: 'Solid top', detail: 'Planked solid-wood top with a clear matte lacquer.', position: '0 0.551 0', normal: '0 1 0' },
      { id: 'shelf', label: 'Lower shelf', detail: 'A full-size second shelf for books, a lamp base or a basket.', position: '0.25 0.1 0.225', normal: '0 0 1' },
    ],
    styles: ['scandinavian', 'minimal'],
    assemblyRequired: true,
    removableLegs: false,
    leadDays: 7,
    credit: polyHaven('Side Table 01', 'James Ray Cock', 'side_table_01'),
  },
  {
    id: 'shelf-taxila',
    slug: 'taxila-cube-bookshelf',
    name: 'Taxila Cube Bookshelf',
    category: 'bookshelf',
    description:
      'An open twelve-cube bookshelf with three fabric storage bins along the bottom row. The open back lets it double as a room divider.',
    sizes: [
      { id: '3x4', label: '3 × 4 Cubes (108 cm)', dims: d(108, 37, 156), price: 42000, packed: d(160, 42, 16), weightKg: 34 },
      { id: 'narrow', label: 'Narrow (92 cm)', dims: d(92, 37, 156), price: 37000, packed: d(160, 42, 16), weightKg: 30 },
    ],
    finishes: [
      finish('natural-oak', 'Natural Oak', 'wood', '#c49a6c'),
      finish('walnut', 'Walnut', 'wood', '#4a3022', 2500),
      finish('sheesham', 'Sheesham', 'wood', '#8a5a3b'),
      finish('white', 'Matte White', 'wood', '#ece6da', 3000),
    ],
    model: {
      glb: '/models/bookshelf-cube.glb',
      native: d(107.8, 37.1, 155.6),
      tintMaterials: ['Wood'],
    },
    hotspots: [
      { id: 'top', label: 'Display top', detail: 'The top surface is about 156 cm high, a good height for plants or frames.', position: '0.3 1.542 0', normal: '0 1 0' },
      { id: 'bins', label: 'Fabric bins', detail: 'Three pull-out grey fabric bins are included.', position: '0 0.2 0.165', normal: '0 0 1' },
      { id: 'cubes', label: 'Open cubes', detail: 'Each cube holds about 15 kg. There is no back panel, so it can stand in the middle of a room.', position: '-0.538 0.95 0', normal: '-1 0 0' },
    ],
    styles: ['scandinavian', 'modern', 'minimal'],
    assemblyRequired: true,
    removableLegs: false,
    leadDays: 7,
    credit: polyHaven('Wooden Display Shelves 01', 'James Ray Cock', 'wooden_display_shelves_01'),
  },
  {
    id: 'desk-gwadar',
    slug: 'gwadar-executive-desk',
    name: 'Gwadar Executive Desk',
    category: 'desk',
    description:
      'A double-pedestal steel desk with seven drawers and a wide laminate top, built for a home office or clinic. The powder-coated body comes in several colours, and the top stays a neutral grey.',
    sizes: [
      { id: '200', label: 'Executive (200 cm)', dims: d(200, 95, 79), price: 115000, packed: d(208, 102, 20), weightKg: 85 },
      { id: '170', label: 'Compact (170 cm)', dims: d(170, 95, 79), price: 98000, packed: d(178, 102, 20), weightKg: 74 },
    ],
    finishes: [
      finish('graphite', 'Graphite', 'metal', '#5b6168'),
      finish('off-white', 'Off-White', 'metal', '#e8e4dc'),
      finish('olive', 'Olive', 'metal', '#5d6b4a', 4000),
      finish('navy', 'Navy', 'metal', '#2b3a55', 4000),
      finish('black', 'Matte Black', 'metal', '#232323'),
    ],
    model: {
      glb: '/models/desk-office.glb',
      native: d(200, 94.7, 78.7),
      tintMaterials: ['Body'],
    },
    hotspots: [
      { id: 'top', label: 'Laminate top', detail: 'A scratch-resistant laminate work surface, about 200 × 95 cm.', position: '0.2 0.787 0', normal: '0 1 0' },
      { id: 'drawers', label: 'Pedestal drawers', detail: 'Drawers on ball-bearing runners, with a central lock.', position: '0.75 0.5 0.43', normal: '0 0 1' },
      { id: 'knee', label: 'Knee space', detail: 'A wide knee opening with a modesty panel at the back.', position: '0 0.68 -0.427', normal: '0 0 1' },
      { id: 'feet', label: 'Levelling feet', detail: 'Adjustable feet to steady it on uneven floors.', position: '0.73 0.03 0.349', normal: '0 0 1' },
    ],
    styles: ['industrial', 'modern'],
    assemblyRequired: true,
    removableLegs: false,
    leadDays: 14,
    credit: polyHaven('Metal Office Desk', 'Ulan Cabanilla', 'metal_office_desk'),
  },
]

// ---------- helpers ----------

/** Find a product by id or slug. */
export function getProduct(idOrSlug: string): Product | undefined {
  return catalog.find((p) => p.id === idOrSlug || p.slug === idOrSlug)
}

/** All products in a category (catalogue order). */
export function byCategory(category: Category): Product[] {
  return catalog.filter((p) => p.category === category)
}
