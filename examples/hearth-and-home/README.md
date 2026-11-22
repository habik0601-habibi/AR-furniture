# Hearth & Home: a separate website that uses RoomSense

A fictional furniture store whose website is **plain HTML and CSS**: no React, no build step, not part of the RoomSense app. It exists to show that RoomSense connects to a completely different website by pasting two lines.

Everything RoomSense-related on a product page is:

```html
<!-- once, at the bottom of the page / in the site template -->
<script src="https://ar-furniture-liard.vercel.app/widget.js" defer></script>

<!-- where the product photos would go -->
<div data-roomsense data-store="hearth" data-product="ravi-coffee-table" data-color="#2f4a3a"></div>
```

Open any page in `products/` and view source to see them. Each product page also has a "How this page uses RoomSense" box showing the same lines.

## Where the store's data lives

The website only holds its own text and prices. The 3D models, sizes, finishes, delivery rules, analytics and shopper quote requests are kept by RoomSense, under the store `hearth`. Log in at `<RoomSense>/dashboard` with the Hearth & Home owner account to see its leads. The shop's login is in `.env.local` (`DEMO_HEARTH_*`) and is not committed.

## Deploy it as its own website (a different address from RoomSense)

1. In Vercel choose **Add New → Project** and import the same GitHub repository again.
2. **Root Directory:** `examples/hearth-and-home`. **Framework Preset:** Other. Leave build command and output directory empty.
3. Deploy. You now have two Vercel sites: RoomSense (the tool) and Hearth & Home (a customer's website).

If your RoomSense address is not `ar-furniture-liard.vercel.app`, regenerate the pages once and commit them:

```bash
ROOMSENSE_URL=https://your-roomsense.vercel.app npx tsx scripts/build-example-shop.ts
```

## Run it locally

```bash
npm run dev                          # RoomSense on http://localhost:5180
npx serve examples/hearth-and-home   # the shop on another port
```

The committed pages point at the deployed RoomSense. To test against your local copy, replace the address in the script tag with `http://localhost:5180`.

## How it was made

`scripts/build-example-shop.ts` writes these files from the same product catalogue that RoomSense uses, so names and prices always match. The product list and the 8% price difference are in `scripts/demoStores.ts`.
