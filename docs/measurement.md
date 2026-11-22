# Room measurement in RoomSense

RoomSense needs one thing from the user's room: a floor-plan rectangle (width × depth, cm) with the doors and windows on its walls, plus the ceiling height. Every measurement mode ends in the same `MeasuredRoom` object:

```ts
interface MeasuredRoom {
  room: Room                    // engine/types.ts: width, depth, height, openings[]
  polygon?: { x: number; y: number }[]   // raw measured outline, plan frame, cm
  method: 'ar' | 'photo' | 'ai-photo' | 'manual'
  confidence: number            // 0–1
  notes: string[]               // human-readable caveats
}
```

Plan frame: origin at the NW corner, x to the right (width), y downwards (depth). By convention **the first wall the user traces becomes the north wall**.

Code: `src/measure/`. Entry component: `MeasureRoom({ onDone, initial? })`.

## 1. The three methods

| Method | Device | How it works | Expected accuracy* |
|---|---|---|---|
| **AR** (`ArMeasure`) | Android + Chrome + ARCore | WebXR `immersive-ar` session with `hit-test`. The phone's visual-inertial tracking (camera + IMU) gives metric 3-D floor points; the user taps each corner | ±2–5 cm per wall |
| **Photo** (`PhotoMeasure`) | Any phone, incl. iPhone (no WebXR) | One photo with a known rectangle on the floor (A4, 60 cm tile, custom). Planar homography maps tapped pixels to cm on the floor | ±1–3 % near the reference; grows with distance (see §3) |
| **AI-assisted photo** | Same | Monocular depth network suggests the floor corners; the user confirms; distances still come from the homography | Same as photo once confirmed |
| **Manual** (`ManualRoom`) | Any | Typed width/depth/height in cm or ft+in, presets, doors/windows editor | As good as the tape measure |

\*Targets/expectations, not field measurements. The photo numbers come from simulation (§3); AR accuracy depends on ARCore tracking and was not measured by us.

The entry screen checks `navigator.xr.isSessionSupported('immersive-ar')`: AR is recommended when it is available, Photo on iOS and other phones, Manual on desktop. The user can review the result on a floor plan (`RoomPlanPreview`), edit the numbers, or measure again.

### From a traced polygon to a `Room` (`geometry.ts`)

Both AR and photo give an ordered list of floor corners in a metric frame. `fitRectangle` turns it into the best rectangle:

1. **Orientation.** Each edge direction φᵢ with length ℓᵢ votes for an axis pair using the "4θ" circular mean: θ = ¼·atan2(Σ ℓᵢ sin 4φᵢ, Σ ℓᵢ cos 4φᵢ). Multiplying angles by 4 makes directions 90° apart identical, so all four walls agree.
2. The x axis is snapped to the first traced edge (it becomes the N wall); the y axis is x rotated +90° in the y-down frame, and the frame is turned 180° (never mirrored) if the room lies on the other side. Clockwise and counter-clockwise tracing both give a correct, un-mirrored plan.
3. **Size.** For a quadrilateral, width/depth are the mean of opposite edge lengths projected onto the axes (a bounding box would overestimate with noisy corners). With 3 corners the 4th is inferred; other polygons use the bounding rectangle with a note.
4. The RMS distance between measured and fitted corners (`residual`) and the worst corner angle error feed the confidence and the notes.

Openings are captured as two floor points along a wall; `snapOpeningToWall` picks the wall nearest the midpoint and stores `offset` from the wall's start corner (west for N/S, north for E/W) and `width`, clamped to the wall.

### AR details (`ArMeasure.tsx`)

`requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor', 'anchors'], domOverlay: { root } })`, three.js `WebGLRenderer` with `xr.enabled`. Each frame, hit-test results from a viewer-space ray are filtered to **horizontal, upward-facing surfaces** (pose Y axis = surface normal, `n_y > 0.85`) **at floor height** (within 12 cm of the lowest such surface seen, so tables and beds are rejected). A reticle shows the hit; the overlay shows a live length label projected at the segment midpoint. Taps arrive as XR `select` events; taps on the overlay buttons are cancelled through the DOM Overlay `beforexrselect` event. Undo / restart / close shape / finish, an opening step (two taps + door/window), a 10 s "no floor found" hint, and handling of permission denial and session end are included. Ceiling height is entered manually (default 275 cm).

## 2. Planar homography (`homography.ts`)

A floor photo is a perspective view of a plane, so image pixels (x, y) and floor coordinates (u, v) in cm are related by a 3×3 homography **H**, defined up to scale:

```
u = (h0·x + h1·y + h2) / (h6·x + h7·y + h8)
v = (h3·x + h4·y + h5) / (h6·x + h7·y + h8)
```

**Direct Linear Transform.** Fixing h8 = 1 and multiplying out, each correspondence gives two linear equations in the remaining 8 unknowns:

```
[ x  y  1  0  0  0  −u·x  −u·y ] · h = u
[ 0  0  0  x  y  1  −v·x  −v·y ] · h = v
```

The four corners of the reference rectangle (world corners (0,0), (w,0), (w,h), (0,h)) give exactly 8 equations, solved by Gaussian elimination with partial pivoting; with more points the normal equations AᵀA h = Aᵀb are solved (linear least squares).

**Normalisation (Hartley).** Before building A, both point sets are translated to their centroid and scaled so the mean distance from it is √2 (matrices T and T′); the result is de-normalised as H = T′⁻¹ Ĥ T. Without this, pixel coordinates in the thousands and cm values in tens make the system badly conditioned. Fixing h8 = 1 is safe after normalisation because the normalised origin is the centroid of the reference corners, a finite point inside the sheet, so its image is finite.

**Which side is long?** Four tapped corners of an A4 sheet fit both a 21 × 29.7 and a 29.7 × 21 rectangle exactly, so the correct assignment is chosen from camera geometry. For a world-plane → image homography H = K[r₁ r₂ t] with K = diag(f, f, 1) (principal point at the image centre), the columns h₁, h₂ satisfy

```
h₁ᵀ ω h₂ = 0          and          h₁ᵀ ω h₁ = h₂ᵀ ω h₂ ,   ω = K⁻ᵀK⁻¹ = diag(1/f², 1/f², 1)
```

Both are linear in k = 1/f²; we solve them together by least squares. The right assignment gives a consistent, positive k (and a plausible focal length); the wrong one does not. When one constraint degenerates (sheet edges parallel to the image plane), a weak prior f ≈ 0.75 × image long side (typical 26 mm-equivalent phone lens) breaks the tie; in near top-down shots the apparent edge lengths are used. The user can always press "Swap sides". The same check flags taps that do not look like a flat rectangle.

Tests (`homography.test.ts`) verify: exact recovery of a known homography from 4 and from 12 points, inverse round-trip, invariance to point order and to image rescaling, rejection of degenerate input, exact cm mapping of far floor points on a synthetic pinhole photo, recovery of the focal length, the long/short side choice with a turned sheet, and the horizon check.

## 3. Error model

Taps are imprecise. We assume each tapped coordinate (8 reference-corner coordinates + 2 per measured point) has independent error σ (default σ = max(1, 0.0006 × image long side) px, i.e. 2.4 px on a 12 MP photo, which assumes the magnifier loupe is used). For a measurement f (for example a wall length), first-order propagation gives

```
σ_f² = Σᵢ (∂f/∂cᵢ · σ)²
```

with the partial derivatives taken by central finite differences (each coordinate moved by ±σ, the homography recomputed, the length re-measured). This captures what users experience: a small tilt error in the plane estimated from a small sheet is amplified far from it, so **error grows with distance from the reference** and **shrinks with a bigger reference**. Each wall is labelled "412 ± 9 cm" on the photo.

Validation: in `photoPipeline.test.ts` a Monte-Carlo simulation (300 trials, Gaussian tapping noise σ = 1.5 px on a synthetic 12 MP photo) gives an RMS error within 0.75–1.3× of the predicted σ. Illustrative simulated numbers (camera 1.4 m high, 4000 × 3000 px, f = 2900 px, uniform ±1.5 px tapping noise, 4 m wall):

| Reference | Wall ≈1.5 m beyond the reference | Wall ≈3.3 m beyond |
|---|---|---|
| A4 sheet | ~15 cm RMS (≈4 %) | ~34 cm RMS (≈8 %) |
| 60 × 60 cm tile | ~3 cm RMS (<1 %) | ~7 cm RMS (≈2 %) |

Hence the UI advice: put the reference about 1 m in front of the wall you care about, prefer a tile or another large rectangle, and "accuracy is best within 2–3 m of the sheet".

**Confidence** = 1 − 4·r (clamped to 0.1–0.97), where r is the larger of the worst relative wall error (σ/L) and the rectangle-fit residual relative to the room size; ×0.7 if the reference fails the perspective-consistency check; ×0.9 if AI-suggested corners were accepted without review. AR uses 0.95 − 3·(fit residual / room size).

Other modelled limitations: lens distortion is ignored (the UI asks for the 1× lens, not the 0.5× ultra-wide); the floor must be flat; corners hidden behind furniture must be estimated by the user; ceiling height cannot be measured from a floor photo and is typed in.

## 4. AI assist: monocular depth (`aiDepth.ts`, `depthAnalysis.ts`)

**Model.** `onnx-community/depth-anything-v2-small` (Depth Anything V2, ViT-S, ~25 M parameters, Apache-2.0) run in the browser with transformers.js v3 `pipeline('depth-estimation')`. On a computer with WebGPU it uses fp16 weights (~50 MB); on phones, and wherever WebGPU is missing, WebAssembly with int8-quantised weights (~27 MB). It is downloaded only when the user taps "Auto-detect", with a progress bar, cached by the browser afterwards, and run in a Web Worker so the UI stays responsive (main-thread fallback if the worker cannot start). The photo is downscaled to 512 px and never leaves the phone.

**Why geometry, not just "AI says 4.2 m".** Depth Anything predicts *relative*, affine-invariant inverse depth: d = s·(1/Z) + t with unknown s and t per image. It cannot give metres by itself. We use a property that holds exactly for a pinhole camera: for any plane, 1/Z is an affine function of the pixel coordinates, 1/Z = a·u + b·v + c. An affine function of an affine function is affine, so **the floor and each wall are still planes in (u, v, d) space** regardless of s and t. The analysis:

1. **Floor plane** — RANSAC fit of d = a·u + b·v + c over the bottom of the image plus the reference sheet (known to lie on the floor), requiring b > 0 (the floor gets nearer towards the bottom of the frame).
2. **Floor region** — flood fill from the sheet over pixels within tolerance of that plane.
3. **Floor/wall boundary** — the top edge of the floor region in each column (median filtered).
4. **Wall lines** — sequential RANSAC fits up to three straight segments (left wall, back wall, right wall).
5. **Refinement** — a wall plane is RANSAC-fitted to the pixels just above each segment, and the segment is replaced by the **intersection of the floor and wall planes**: (a_f − a_w)u + (b_f − b_w)v + (c_f − c_w) = 0. Where two surfaces meet, their true 1/Z agree, so their d agree for any s, t: the line is scale-invariant. This removes the bias of step 3 (the floor region "bleeds" a few pixels up the wall because the two planes are continuous at the junction).
6. **Corners** — intersections of consecutive lines become suggested handle positions; the user drags them if needed. The floor mask, the lines and an optional depth-map view are drawn on the photo.

Metric values still come only from the reference-sheet homography; the network only says *where* the floor ends. On a synthetic room rendered with an affine-distorted, noisy inverse-depth map, the suggested back corners are within 3 px of the truth and the result is invariant to the affine scale (`depthAnalysis.test.ts`).

**Honest limitations.** Real network output is only approximately affine-consistent, smooths edges, and can be wrong on reflective or textureless floors, rugs, and dark rooms. Furniture against a wall hides the floor line; RANSAC tolerates small occluders, but large ones (a sofa along the whole wall) shift the suggestion. Only corners visible in the photo can be suggested (usually the two far corners). The AI step is therefore a *suggestion the user confirms*, results are labelled `method: 'ai-photo'`, and unreviewed suggestions lower the confidence. The real-photo accuracy of the AI suggestions has not been measured.

## 5. What has and has not been verified

- Verified by unit tests (Vitest, 37 tests): homography maths, focal/orientation logic, error propagation incl. Monte-Carlo agreement, rectangle fitting (rotated, noisy, 3-point, L-shaped, CCW), opening mapping, the full photo pipeline on synthetic photos, and the depth analysis on synthetic depth maps.
- The production build bundles the depth worker and lazy-loads three.js (AR) and transformers.js separately.
**Memory (changed after a phone test).** On the first phone test the model downloaded and then failed with an out-of-memory message, so shoppers had to type the size by hand. The loader (`depthCore.ts`, ladder in `depthPlan.ts`) now:

1. never uses WebGPU on phones (its memory is shared with the page);
2. feeds the network a smaller image: 266 px on phones instead of the library's default 518, and steps down to 196 px if that still fails, because working memory grows with the square of the input;
3. switches off ONNX Runtime's scratch-memory arena on the WebAssembly path;
4. catches a failure *while the model runs* (previously only failures while loading were caught), releases the session and retries on the next, lighter rung.

Measured on a desktop with the same int8 weights (`scripts/depth-memory-probe.mjs`, native ONNX Runtime in Node, one fresh process per size, a standard indoor test photo):

| Input | Extra memory while running | Speed | Depth map vs the 518 px default (correlation) |
|---|---|---|---|
| 518 px (old default) | 161 MB | 413 ms | reference |
| 364 px | 148 MB | 353 ms | 0.995 |
| 266 px | 68 MB | 172 ms | 0.986 |
| 196 px | 41 MB | 122 ms | 0.943 |

At 266 px, switching off the memory arena cut the extra memory from 68 MB to 9 MB, and the whole process peak from 322 MB (old settings) to 148 MB. **These are desktop figures.** A phone runs WebAssembly, whose absolute numbers differ, and this change has not yet been confirmed on a phone. The depth map is slightly less detailed at smaller sizes; the suggested corners are always confirmed or dragged by the user.

- Not verified without devices: the WebXR session on a real Android phone (written against the WebXR, Hit Test and DOM Overlay specs), touch handling and the loupe on iPhone Safari, the depth model's speed and memory use on phones (the memory reduction above is measured on a desktop only), and real-world accuracy. WebXR requires HTTPS: test through a tunnel or a self-signed HTTPS dev server, not plain `http://<LAN-IP>`.
