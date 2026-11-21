# 3D model credits

The demo catalogue uses real 3D models made by other people. Each one is under a licence that
allows public and commercial use. The product names, prices and descriptions in `catalog.ts`
belong to a fictional brand. The models do not show products of any real Pakistani shop.

Each model was optimised for the web with `scripts/models/build-models.mjs`:

- the meshes were joined and welded
- the single texture material was split into a tintable part and a fixed part
- the tintable part got a greyscale base-colour texture
- textures were resized to 1024 px (2048 px for the two hero sofas) and saved as JPEG
- geometry was compressed with Draco

Two models also had their proportions changed. These changes are listed in the table below.

| File (`public/models/`) | Original title | Author | Licence | Source |
|---|---|---|---|---|
| `sofa-velvet.glb` | Glam Velvet Sofa | Eric Chadwick; © 2021 Wayfair, LLC | CC BY 4.0 | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/GlamVelvetSofa |
| `sofa-classic.glb` | Sofa 01 | Kirill Sannikov (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/Sofa_01 |
| `sofa-chesterfield.glb` | Sofa 02 | Kirill Sannikov (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/sofa_02 |
| `armchair-tufted.glb` | Sheen Chair | Eric Chadwick; Wayfair, LLC | CC0 1.0 | https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenChair |
| `armchair-classic.glb` | Arm Chair 01 | Kirill Sannikov (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/ArmChair_01 |
| `bed-carved.glb` | Gothic Bed 01 | Kirill Sannikov (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/GothicBed_01 |
| `wardrobe-carved.glb` | Gothic Cabinet 01 (doors closed, depth reduced to 60 %) | Kirill Sannikov (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/GothicCabinet_01 |
| `dresser-carved.glb` | Gothic Commode 01 | Kirill Sannikov (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/GothicCommode_01 |
| `dining-table-round.glb` | Round Wooden Table 01 (height reduced to 76 %) | Ulan Cabanilla (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/round_wooden_table_01 |
| `dining-chair-tufted.glb` | Dining Chair 02 | James Ray Cock (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/dining_chair_02 |
| `coffee-table-modern.glb` | Modern Coffee Table 01 | Amin (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/modern_coffee_table_01 |
| `tv-unit-slatted.glb` | Modern Wooden Cabinet | Patrik Pangerl (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/modern_wooden_cabinet |
| `side-table-oak.glb` | Side Table 01 | James Ray Cock (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/side_table_01 |
| `bookshelf-cube.glb` | Wooden Display Shelves 01 | James Ray Cock (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/wooden_display_shelves_01 |
| `desk-office.glb` | Metal Office Desk | Ulan Cabanilla (Poly Haven) | CC0 1.0 | https://polyhaven.com/a/metal_office_desk |

## Licence notes

- **Poly Haven:** every asset is CC0 ("You can use our assets for any purpose", https://polyhaven.com/license).
  Attribution is not required, but it is given here anyway.
- **Khronos glTF-Sample-Assets:** each model's licence is set in its own `metadata.json`.
  - *GlamVelvetSofa* is CC BY 4.0, by Eric Chadwick, © 2021 Wayfair, LLC.
    Attribution is required, so this credit must stay visible wherever the model is shown.
    The 3D model was changed from the original: the material variants and lights were removed,
    the fabric colour is re-tinted at runtime, and the model was compressed.
  - *SheenChair* is CC0 1.0, by Eric Chadwick, © 2020 Wayfair, LLC.
    The product label mesh and material variants were removed.
- CC BY 4.0 legal code: https://creativecommons.org/licenses/by/4.0/legalcode
- CC0 1.0 legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode
