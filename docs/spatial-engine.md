# RoomSense spatial decision engine

Source: `src/engine/` (pure TypeScript, no DOM, deterministic). Tests: `npx vitest run src/engine`.

## 1. Problem

A shopper on a Pakistani furniture website wants to know, before buying:
*will this piece fit in my room, where would it go, will the room still work,
can it even be delivered into the flat, and what will delivery cost?*
Existing AR viewers only overlay a 3D model; they do not reason about space.
The engine turns a measured room (walls, doors, windows, ceiling) and a list of
products into **decisions with explanations**: an automatic layout, a 0–100
compatibility score, a fits / tight / does-not-fit verdict, a delivery-path
check, ranked recommendations and a delivery quote.

Conventions: centimetres; plan origin at the room's north-west corner, x east,
y south; rotation 0 = front faces south, rotating clockwise in 90° steps.
Because furniture rotates in 90° steps every footprint is an axis-aligned
rectangle, so overlap, inside-room and zone tests are exact and O(1).

| Module | Responsibility |
|---|---|
| `geometry.ts` | footprints, overlap, gaps, front/side zones, door-swing and window zones |
| `rules.ts` | one table of interior-design rules of thumb (clearances, wall pieces, tall pieces, relationships) |
| `placement.ts` | `optimiseLayout` (candidates → greedy → simulated annealing), `evaluateLayout` |
| `fit.ts` | `assessFit`: score + verdict for one product in the current room |
| `deliveryPath.ts` | doorway, corridor-corner, stairs and lift geometry |
| `recommend.ts` | room-aware ranking with reasons, CIEDE2000 colour harmony |
| `color.ts` | sRGB↔CIELAB, ΔE76/ΔE2000, k-means++ dominant colours |
| `deliveryCost.ts` | PKR delivery quote: vehicle choice, stairs labour, assembly |
| `pricing.ts` | configured price, lakh-style `pkr()` formatting |

## 2. Layout optimiser (`optimiseLayout`)

### 2.1 Constraints

**Hard** (never violated by the optimiser; an item that cannot satisfy them
goes to `unplaced`):

1. footprint inside the room;
2. no overlap between footprints;
3. outside every door's keep-clear zone: a 60 cm approach strip, and for
   inward-swinging doors the leaf's quarter-circle approximated by its bounding
   square (side = door width) — conservative;
4. tall pieces (wardrobe, bookshelf, or anything ≥ 150 cm) outside the 50 cm
   zone in front of a window.

Locked items (`fixed` with `locked: true`) are never moved; if they themselves
break a hard rule this is reported as an `error` violation.

**Soft** terms, each 0–100, combined as a weighted mean:

| Term | Weight | Definition |
|---|---|---|
| Clearance | 25 | per item, clear depth ÷ required depth on the sides that matter (front; both/one side for beds by width; all sides for a dining table with chairs exempt; back for chairs). Clear depth is computed exactly as the distance to the nearest wall or non-exempt item that overlaps the zone laterally. Items are weighted by footprint area. |
| Walkways | 25 | % of items reachable from a door by a person of walkway width *W* (default 75 cm), see 2.3 |
| Relationships | 20 | mean over items that have a partner present (table below) |
| Wall alignment | 12 | wall pieces: gap between back and wall, 1 at ≤ 5 cm falling to 0 at 60 cm |
| Natural light | 8 | per window, 1 − share of a 60 cm zone covered by furniture taller than the sill |
| Balance / free floor | 10 | 0.6·(1 − distance of area-weighted centroid from room centre ÷ half-diagonal) + 0.4·min(1, free floor ÷ 60 %) |

Reported `score = Σ wᵢ·vᵢ / Σ wᵢ × (placed items / requested items)`.

Relationships (rules of thumb, all in `rules.ts`), scored with a band
function `band(v, min, max, f)` = 1 inside [min, max], linear to 0 at distance f outside:

| Subject → partner | Measure | Band |
|---|---|---|
| sofa ↔ TV unit (faces) | distance between front-edge centres × both facing (cosine ≥ 0.5) × clear line of sight (nothing taller than 60 cm between them, else ×0.3) | 180–350 cm |
| coffee table in front of sofa/armchair | gap from seat front edge × lateral overlap × centring × long side parallel | 35–50 cm |
| side table beside sofa/bed/armchair | edge gap × at the side × aligned with the anchor's back; a second table on an already-used side ×0.4 | 0–15 cm |
| dining chair around dining table | edge gap × facing the table | 0–15 cm |
| armchair near sofa | edge gap × facing the coffee table / sofa | 30–120 cm |

### 2.2 Search

1. **Candidate poses** per item. Wall pieces: back flush against each wall,
   sliding on a 10 cm grid (≈180 poses in a 5×4 m room). Others: a floor grid
   (step = max(10, √(area/600)) rounded to 5 cm, i.e. 20 cm in 5×4 m) in 4
   rotations (2 for symmetric tables). **Relation poses** generated from what
   is already placed: coffee table 35/42/50 cm in front of a sofa, chair slots
   around a table, nightstands back-aligned on both sides of a bed, TV unit on
   the wall the sofa faces, armchairs at the sofa ends turned inwards.
2. **Greedy construction** in priority order (bed, wardrobe, sofa, dining
   table, TV unit, wall storage, armchair, coffee table, chairs, side tables;
   ties → larger first). All feasible candidates are ranked by the objective
   without the walkway term (cheap, O(n²)); the best 5 are re-ranked with the
   full objective (with BFS).
3. **Simulated annealing** with a seeded mulberry32 RNG.
   Moves: shift (Gaussian, σ = 5 + 60·T/T₀ cm; wall pieces slide along their
   wall; 70 % of the time the item's dependants — chairs of a table, coffee
   table of a sofa — move with it), jump to another static candidate, snap to
   a relation pose, rotate (free pieces), swap two items (wall pieces re-snap
   to the wall), insert an unplaced item. Infeasible proposals are discarded,
   so every visited state satisfies the hard constraints.
   Objective `J = score − 15 × unplaced`. Acceptance (Metropolis):
   accept if ΔJ ≥ 0, else with probability exp(ΔJ / T).
   Geometric cooling `T(k) = T₀·(T_end/T₀)^(k/N)`, T₀ = 5, T_end = 0.05
   (objective points), N = 2000 by default (`opts.iterations`). The best state
   seen is returned.

### 2.3 Walkway connectivity (rasterised BFS)

The plan is rasterised to 5 cm cells (coarser only above ~20 000 cells).
Instead of moving a disc of diameter *W*, obstacles are inflated by *r = W/2*
(Minkowski sum): a cell is blocked if its centre is within *r* of a footprint
or a wall, except along door spans. BFS (4-neighbour) starts from the cells in
each doorway. An item counts as reachable if a reached cell lies within
*r* + 25 cm of its footprint (in front of its front edge for front-access
items such as wardrobes, sofas, desks). For unreachable items the BFS is
repeated at 60 and 45 cm to produce messages like *"Walkway to the wardrobe is
only about 60 cm wide (75 cm recommended)"*. Cost: O(cells) ≈ 8 000 cells
for 5×4 m, done once per annealing step.

`evaluateLayout(room, placed)` runs the same scoring on a user-edited layout
without moving anything (live score while dragging).

## 3. Fit assessment (`assessFit`)

| Check | Severity | Weight |
|---|---|---|
| footprint fits the floor in either rotation | error | 20 |
| height under the ceiling | error | 10 |
| a valid pose exists with the current layout locked (optimiser, 300 iterations) → `suggested` | error | 25 |
| clearance at that pose | warning | 15 (partial credit = clearance ratio) |
| walkways still open with the new piece | warning | 10 (share of items still reachable) |
| proportion: > 25 % of floor, or sofa > ⅔ of its wall | warning | 10 (0.4 credit if failed) |
| delivery path (if a route is given) | error | 10 |

Score = weighted share of earned credit (weights of skipped checks are
redistributed; capped at 35 if an error check fails). Verdict: any failed
error → `does_not_fit`; any failed warning or an error-check margin under
10 cm → `tight`; else `fits`.

## 4. Delivery path (`checkDeliveryPath`)

The item is a rigid box: boxed size if it ships packed, otherwise assembled
size, minus the leg height (default 15 cm) if the legs come off.

* **Doorway W×H** (thin wall): passes if some cross-section fits:
  `across ≤ W` and `vertical ≤ H`, trying in order *carried upright* (d, h),
  *tilted on its back* (h, d), *stood on end* (d, w), etc. The classic
  "tilt-through" rule (d < W and √(d² + h²) < H) is implied by the upright
  cross-section for a rigid box, so it adds no extra cases; the profile trick
  movers use with real sofas relies on the sofa not being a box (see limits).
* **Corridor corner** between widths *a* and *b* — the classic moving-sofa /
  ladder-around-a-corner problem. A flat rectangle of length *L*, width *w* can
  rotate round the corner iff

  `L ≤ L_max(a, b, w) = min_{0<θ<π/2} [ a/sin θ + b/cos θ − w/(sin θ cos θ) ]`

  solved numerically (2 001 samples, then 60 golden-section steps). It can
  also pass without rotating if `w ≤ a and L ≤ b` or `L ≤ a and w ≤ b`.
  Checks against closed forms in the tests: `L_max(1,1,0) = 2√2`,
  `L_max(a,b,0) = (a^{2/3} + b^{2/3})^{3/2}`, `L_max(a,a,w) = 2√2·a − 2w`.
  If carrying flat fails, the item is tried **stood on end** (plan footprint =
  two smaller dims, longest dim must be under the ceiling; ceiling assumed
  door height + 30 cm, and the result says so). Example: a 200×90×85 sofa
  needs L ≤ 84.6 cm flat in a 90/90 corner (fails) but passes stood on end.
* **Stairs**: cross-section vs stair width × headroom; a landing is a corner
  with widths (stair width, landing depth).
* **Lift**: the door is a doorway check; the box fits the cabin if its sorted
  dimensions fit the sorted cabin dimensions, or *leaned diagonally*: one
  dimension across one cabin axis and the other two fitting the remaining
  cabin face by **Carver's rectangle-in-rectangle condition**
  (p×q, p ≥ q into A×B, A ≥ B fits iff p ≤ A, q ≤ B, or p > A and
  B ≥ (2pqA + (p² − q²)√(p² + q² − A²)) / (p² + q²)).
* Floor 0 skips vertical transport; floor > 0 uses the lift, falling back to
  the stairs ("Take the stairs instead of the lift"); no lift and no stairs → fail.
  Advice on failure: leg removal if that alone would pass, otherwise smaller size / knock-down version.

## 5. Recommendations (`recommend`)

Every size of every candidate is fitted with `assessFit` (layout locked);
sizes that do not fit are dropped and the best size per product is kept.

`score = 0.35·fit + 0.20·completion + 0.20·budget + 0.15·colour + 0.10·style`

* completion: wanted category 1; missing complement of something in the room
  (sofa → coffee table, side table, TV unit; bed → side table, wardrobe; dining
  table → chairs) 1; duplicate of a single-instance piece 0.15;
* budget: 1 at or under budget, linear to 0 at 50 % over;
* colour: finishes vs the photo's dominant colours (k-means++ in CIELAB,
  k = 5). ΔE2000 < 12 to any room colour → 1 ("matches the warm tones…");
  neutral finish (chroma < 12) → 0.85; coloured finish in an all-neutral room → 0.7;
  analogous hue (≤ 35°) → 0.85;
  complementary (≥ 150°) → 0.75; otherwise 0.35;
* style: overlap with preferred style tags.

Reasons are generated from the actual numbers, e.g. *"Fits the 150 cm free
stretch of the north wall"*, *"Rs 38,000 under your budget"*,
*"Completes the room: there is a sofa but no coffee table yet"*.
The ΔE2000 implementation reproduces the Sharma–Wu–Dalal reference pairs to 4 decimals.

## 6. Delivery cost (`estimateDelivery`)

Vehicle = smallest of Suzuki Ravi pickup, Hyundai Shehzore, Mazda 16 ft,
20 ft container whose *usable* volume (cargo volume × 0.7 stacking
efficiency), payload and cargo length take the load; otherwise several trips
of the largest. Transport = flat intra-city fare, or base + per-km × road
distance (approximate road-distance table for 11 cities). Stairs labour (only
without a lift) = Σ items rate(weight band) × floors; assembly per item;
optional insurance/packing as % of goods value; total rounded up to Rs 50.
Days = 1–2 within a city, plus ⌈km / 500⌉ in transit. All rates are
illustrative 2026 figures and every store can override `DeliveryRules`.

## 7. Measured performance

Measured on an Intel Core i5-12400F, Node 25.8.1 (run with `tsx`), 10 seeds
each. Browser JS engines are comparable but these are not browser numbers.

| Scenario | Iterations | Mean score | Median time |
|---|---|---|---|
| Living room 5×4 m, 8 items | 0 (greedy only) | 99.6 | 17 ms |
| | 2 000 (default) | 99.6 | 63 ms |
| Dining 4.2×3.6 m, table + 6 chairs + sideboard | 0 | 90.3 | 17 ms |
| | 500 | 96.6 | 25 ms |
| | 2 000 | 98.7 | 46 ms |
| | 5 000 | 99.7 | 85 ms |
| Crowded bedroom 4×3.5 m, 10 items | 0 | 79.0 | 8 ms |
| | 2 000 | 91.8 | 32 ms |
| Bedroom 3.8×3.6 m, 5 items | 2 000 | 99.5 | 20 ms |

* Inside the Vitest suite (workers running in parallel) the 8-item living
  room at default iterations measured 61–131 ms (median ≈ 94 ms); the test
  asserts < 300 ms.
* `evaluateLayout` (live re-scoring while dragging): 0.11 ms per call for 8 items.
* `assessFit`: ≈ 12 ms; `recommend` over 12 products × 3 sizes: ≈ 180 ms.
* Complexity per annealing step: O(n²) for clearance/relations + O(cells) for
  the BFS. Greedy: O(n · candidates · n²).

The annealing matters when the greedy result is poor (crowded room +12.8
points, dining room +8.4); for spacious rooms greedy construction with
relation-driven candidates is already near the objective's optimum.

## 8. Limitations (honest)

* Furniture is axis-aligned (0/90/180/270°); rooms are rectangles. L-shaped
  rooms, angled placement and wall niches are not modelled.
* The door swing is approximated by a square (conservative); radiators,
  sockets and columns are ignored.
* All design numbers are rules of thumb, not a published standard; the
  objective weights were set by hand, not learned or validated with users.
  A score near 100 means "satisfies our rules", not "beautiful".
* The optimiser is a heuristic: no optimality guarantee; different seeds can
  give different layouts (the result is deterministic for a given seed).
* Walkway check is a 2D grid approximation (5 cm resolution) of a person as a
  disc; door-to-door through-routes are not separately required.
* Delivery: items are rigid boxes. Real sofas have an L-shaped side profile
  that movers exploit ("diagonal depth"); we do not model it, so results are
  conservative for sofas. Corridor ceiling height is assumed (door + 30 cm).
  The diagonal lift fit ignores whether the item can be tilted into that pose
  through the lift door. 3D corner manoeuvres (tilting while turning) are not modelled.
* Delivery rates, vehicle capacities and road distances are approximate,
  illustrative values.
* Colour harmony uses simple, explainable rules (ΔE, hue angle), not a learned
  aesthetic model; photo colours depend on lighting and white balance.
