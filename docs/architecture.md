# RoomSense architecture

RoomSense is an embeddable tool, not a shop. A furniture store adds two lines to its product pages; shoppers then get a 3D viewer, AR, room measurement, automatic layout, fit and delivery checks, recommendations and a delivery quote, and can send the whole configuration to the store.

## The three surfaces

| Surface | Who | Route | What it is |
|---|---|---|---|
| Widget | Shoppers, on the store's site | `public/widget.js` → iframe `/embed/:store/:product` | Inline 3D viewer + "View in your room" button that opens the full experience in an overlay |
| Experience | Shoppers | `/embed/:store/:product` | Six steps: Customize → Your room → Fit & layout → Delivery → Suggestions → Send to store |
| Dashboard | Store owners | `/dashboard` | Funnel analytics, quote requests, products and 3D models, delivery rules, embed code |

Two fictional demo shops (`/demo/shahi`, `/demo/nest`) with different designs embed the widget exactly as a real store would. Their only RoomSense code is the script tag and one `<div data-roomsense …>` per product page.

## How it fits together

```
Store's product page                         RoomSense (this app, on Vercel)                Supabase
┌──────────────────────────┐   widget.js    ┌────────────────────────────────────┐        ┌──────────────────────┐
│ <script src=widget.js>   │ ─────────────▶ │ /embed/:store/:product  (iframe)   │ ─────▶ │ stores, products     │
│ <div data-roomsense …>   │  Shadow DOM +  │   ProductViewer (model-viewer)     │  read  │  (public read, RLS)  │
│                          │  iframe        │   MeasureRoom (WebXR / photo / AI) │        │                      │
│                          │ ◀───────────── │   Spatial engine (pure TypeScript) │ ─────▶ │ track_event()        │
│                          │  postMessage   │   Quote request                    │  rpc   │ request_quote()      │
└──────────────────────────┘  (close/open)  └────────────────────────────────────┘        │ store_funnel()  ...  │
                                            /dashboard (store owner, email login) ───────▶ │ storage: models/     │
                                                                                            └──────────────────────┘
```

* **Widget isolation.** `widget.js` renders its button in a Shadow DOM and the experience in an iframe, so the host site's CSS cannot break RoomSense and RoomSense cannot break the host site. The iframe gets `allow="xr-spatial-tracking; camera; …"` so AR and the camera work inside it.
* **The spatial engine runs on the shopper's phone.** Placement, fit, delivery-path, recommendation and delivery-cost code (`src/engine/`) is pure TypeScript with no DOM or network. It is fast enough to run in the browser (see `docs/spatial-engine.md`) and it means a shopper's room never has to leave their device.
* **The shopper's room stays local.** The measured room, the furniture they already own, their building's access route and city are kept in `localStorage` (`src/pages/embed/state.ts`). They are reused across products and across shops that use RoomSense on the same device. They are only sent to a store when the shopper presses "Send request", and then only as part of that request.
* **Measurement** (`src/measure/`) produces one `MeasuredRoom` whichever method is used: AR hit-testing (Android), planar homography from a reference sheet (any phone), with an on-device depth model suggesting corners, or manual entry. See `docs/measurement.md`.

## Data model (Supabase)

| Table | Purpose | Who can read | Who can write |
|---|---|---|---|
| `stores` | One row per furniture store, brand colour, origin city, delivery-rule overrides | Anyone (active stores) | Owner (update only) |
| `products` | Catalogue: sizes, finishes, 3D model info, hotspots (jsonb mirrors `src/data/types.ts`) | Anyone (active products of active stores); owner sees hidden ones | Owner |
| `events` | Funnel analytics (opened, 3D, AR, measured, fit, delivery, quote) | Owner | Only via `track_event()` |
| `quote_requests` | Leads with the full configuration, room fit and delivery estimate | Owner | Only via `request_quote()`; owner updates status |
| storage `models/` | Uploaded GLB files, one folder per store id | Public | Owner of that store id |

Security rules are in `supabase/migrations/0001_schema.sql`:

* Row-level security on every table. Ownership is checked by `private_is_owner(store)`, which only ever answers for the signed-in user.
* Shoppers are anonymous and only hold the publishable key. Direct inserts into `events` and `quote_requests` are revoked; the two `SECURITY DEFINER` functions validate the store and product, cap payload size and rate-limit per anonymous session (120 events per 10 minutes, 5 quote requests per day).
* Analytics functions (`store_funnel`, `store_fit_outcomes`) return nothing unless the caller owns the store.

## Code layout

```
public/widget.js            the embeddable script (no build step, ~6 KB)
public/models/              optimised GLB models for the demo catalogue
src/engine/                 spatial engine: placement, fit, delivery path, recommend, colour, delivery cost
src/measure/                room measurement: WebXR AR, photo homography, AI depth assist, manual
src/components/             ProductViewer (model-viewer), UI kit, icons
src/data/                   catalogue types and the demo catalogue
src/pages/embed/            the shopper experience
src/pages/dashboard/        the store dashboard
src/pages/demo/             two demo shops
supabase/migrations/        schema, RLS, functions
supabase/seed/, scripts/    demo stores, owners and catalogue seeding
docs/                       architecture, spatial engine, measurement
```
