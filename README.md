# RoomSense

**3D, AR and AI room-fit for furniture websites.** A furniture store adds two lines to its product pages. Shoppers can then:

1. see the product in **3D** (rotate, zoom, hotspots, true dimensions),
2. **customize** size, fabric and colour on the model with a live price,
3. place it in their room in **AR** at real size (Android and iPhone, no app),
4. **measure their room**: AR on Android, or one photo with an A4 sheet on any phone, with an on-device AI depth model suggesting the corners,
5. get an **automatic layout** from a constraint optimiser (walkways, door swings, windows, the sofa facing the TV) that they can adjust by dragging,
6. see a **fit score** and a **delivery-path check** through doors, corridor corners, stairs and the lift,
7. get a **delivery cost** for Pakistani cities (vehicle, stairs without a lift, assembly),
8. get **recommendations** that fit the free space, budget, style and the colours of their room photo,
9. **send the configuration** to the store, which sees it in its **dashboard** with funnel analytics.

University project. The two demo shops (Shahi Furniture, Nest Living) and their products are fictional. 3D models are open-licence models credited in [`src/data/credits.md`](src/data/credits.md).

## Documents

* [docs/architecture.md](docs/architecture.md): surfaces, data model, security, code layout
* [docs/spatial-engine.md](docs/spatial-engine.md): placement optimiser, fit score, delivery-path geometry, recommender, delivery cost
* [docs/measurement.md](docs/measurement.md): AR measurement, photo homography, AI depth assist, error model

## Run it

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in your Supabase URL and publishable key.

```bash
npm run dev
```

Open http://localhost:5180. The demo shops are at `/demo/shahi` and `/demo/nest`, the dashboard at `/dashboard`.

AR and camera features need HTTPS on a phone. Use the deployed site (Vercel), or a tunnel to the dev server.

## Set up the database (once)

1. Create a Supabase project and run `supabase/migrations/0001_schema.sql`.
2. Create the two demo store owners: put `DEMO_SHAHI_EMAIL/PASSWORD` and `DEMO_NEST_EMAIL/PASSWORD` in `.env.local`, then run `supabase/seed/01_stores.sql` with those passwords filled in.
3. Seed the catalogue into both stores: `npx tsx scripts/seed-products.ts`.

## Tests

```bash
npm test
```

86 tests (Vitest), all passing:

| Area | Tests | What they check |
|---|---|---|
| Spatial engine (`src/engine`) | 49 | Layout safety over 30 random rooms (inside room, no overlap, doors and windows kept clear), locked items, sofa/coffee-table/TV relations, walkway search, corner-turn formula against closed forms, doorway/stairs/lift cases, fit verdicts, recommendations, delivery vehicle choice, ΔE2000 reference pairs, k-means |
| Measurement (`src/measure`) | 37 | Homography recovery and invariance, A4 mapping on a synthetic perspective photo, error model vs simulated tapping noise, rectangle fitting, door/window snapping, depth-map floor and wall detection |

`node scripts/check-hearth.mjs` checks the cross-site demo: a quote sent from the separate Hearth & Home website reaches only that store's owner.

`node scripts/check-dashboard.mjs` signs in as the demo owners and checks the security rules on the live database: one store cannot read another store's quote requests or analytics, and anonymous shoppers cannot read quotes or insert events directly.

## Status: what is verified and what is not

Verified in the browser (desktop): the landing page, both demo shops, the widget, all six shopper steps (3D viewer with live recolouring and hotspots, sample and typed rooms, automatic layout and drag editing, fit report, delivery path and cost, recommendations, quote request), and the quote arriving in the store's data.

Also verified from a different origin (the example site on one port, RoomSense on another): the widget button, the inline 3D view, the full overlay, closing it, and a quote request reaching the right store.

Not verified yet:
* **AR and camera inside another site's page on a real phone.** The widget runs RoomSense in a frame with camera and AR permissions granted, but a frame can behave differently from a full page on iPhone and Android.
* **The AI corner step on a phone.** On the first phone test the depth model ran out of memory. It now runs smaller and lighter and retries if it fails (see `docs/measurement.md`), which reduced memory in desktop measurements, but it has not been re-tested on a phone.
* **AR and camera on a real phone.** WebXR measurement (Android), AR Quick Look (iPhone), photo measurement with touch, and the AI depth model have not run on a phone. They need HTTPS, so test them on the Vercel deployment.
* **Real-world measurement accuracy.** Figures in `docs/measurement.md` come from simulation.
* **The dashboard screens** were checked through their database calls (`scripts/check-dashboard.mjs`), not clicked through in a browser.

## Future work

* Measure ceiling height in AR, and support non-rectangular (L-shaped) rooms.
* Free rotation (not only 90° steps) and L-shaped sofa profiles in the delivery-path check.
* Show the whole layout in AR (all pieces at once), not one product at a time.
* A 3D room view of the generated layout.
* Generate 3D models from product photos for stores that have none.
* Learn layout weights from real shopper choices instead of hand-tuned rules.
* Multi-box shipments for flat-pack items; live courier rates instead of illustrative ones.
* Urdu interface.
* Enforce the allowed-websites list (`stores.allowed_origins`) so only a store's own site can embed its widget; today any site can.

## Deploy to Vercel

1. Import the repository in Vercel. Framework preset **Vite**, build `npm run build`, output `dist`.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables.
3. `vercel.json` rewrites all paths to `index.html` so `/embed/...` and `/demo/...` deep links work.

## Demo websites

| Site | Where | What it shows |
|---|---|---|
| Shahi Furniture, Nest Living | `/demo/shahi`, `/demo/nest` inside the RoomSense app | Two shops with different designs, built into the app for convenience |
| **Hearth & Home** | [`examples/hearth-and-home`](examples/hearth-and-home), deployed as its **own** website | A plain HTML site, not part of RoomSense, that uses it by pasting the two lines: proof it works on a different website |

All three are fictional stores. See [examples/hearth-and-home/README.md](examples/hearth-and-home/README.md) to deploy the separate site.

## Embed it on any site

```html
<script src="https://YOUR-DEPLOYMENT/widget.js" defer></script>
<div data-roomsense data-store="your-store" data-product="product-slug"></div>
```
