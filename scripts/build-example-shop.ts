// Generates examples/hearth-and-home: a plain HTML/CSS website for the fictional
// store "Hearth & Home". It is deliberately NOT built with the RoomSense app: no
// React, no build step, hosted on its own address. Its only RoomSense code is the
// script tag in each page and one <div data-roomsense> on each product page.
// Usage: npx tsx scripts/build-example-shop.ts   (optionally with ROOMSENSE_URL=...)
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { catalog } from '../src/data/catalog'
import { pkr } from '../src/engine/pricing'
import { HEARTH, markupPrice } from './demoStores'

/**
 * Address of the deployed RoomSense app. A real store pastes its own.
 * Override with:  ROOMSENSE_URL=https://your-app.vercel.app npx tsx scripts/build-example-shop.ts
 */
const ROOMSENSE = (process.env.ROOMSENSE_URL ?? 'https://ar-furniture-liard.vercel.app').replace(/\/$/, '')

const out = new URL('../examples/hearth-and-home/', import.meta.url)
const dir = (p: string) => new URL(p, out)
mkdirSync(dir('products/'), { recursive: true })
mkdirSync(dir('assets/'), { recursive: true })

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const items = HEARTH.products.map((slug) => {
  const p = catalog.find((c) => c.slug === slug)
  if (!p) throw new Error(`catalog is missing ${slug}`)
  const sizes = p.sizes.map((s) => ({ ...s, price: markupPrice(s.price, HEARTH.markup) }))
  copyFileSync(new URL(`../public/posters/${slug}.webp`, import.meta.url), dir(`assets/${slug}.webp`))
  return { ...p, sizes, from: Math.min(...sizes.map((s) => s.price)) }
})

const scriptTag = `<script src="${ROOMSENSE}/widget.js" defer></script>`
const divTag = (slug: string) =>
  `<div data-roomsense data-store="${HEARTH.slug}" data-product="${slug}" data-color="#2f4a3a" data-height="440"></div>`

const head = (title: string, depth: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${depth}style.css">
</head>`

const header = (depth: string) => `<div class="banner">Demo website for the RoomSense project. Fictional store, no real orders. This site is plain HTML hosted separately from RoomSense.</div>
<header class="site-header">
  <div class="wrap bar">
    <a class="logo" href="${depth}index.html">Hearth <span>&amp;</span> Home</a>
    <nav aria-label="Main"><a href="${depth}index.html#collection">Collection</a><a href="${depth}index.html#about">About</a><a href="${depth}index.html#delivery">Delivery</a></nav>
    <span class="cart">Cart (0)</span>
  </div>
</header>`

const footer = `<footer class="site-footer"><div class="wrap"><p>Hearth &amp; Home is a fictional store made for a university project. 3D models are open-licence models credited inside the RoomSense viewer.</p></div></footer>`

// ---------------------------------------------------------------- home page
const card = (p: (typeof items)[number]) => `
      <a class="card" href="products/${p.slug}.html">
        <img src="assets/${p.slug}.webp" alt="${esc(p.name)}" width="400" height="300" loading="lazy">
        <div class="card-body">
          <h3>${esc(p.name)}</h3>
          <p class="price">from ${pkr(p.from)}</p>
        </div>
      </a>`

writeFileSync(
  dir('index.html'),
  `${head('Hearth & Home · Furniture for warm homes', '')}
<body>
${header('')}
<main>
  <section class="hero">
    <div class="wrap">
      <p class="eyebrow">Islamabad · delivering across Pakistan</p>
      <h1>Furniture for homes that feel like <em>yours</em>.</h1>
      <p class="lead">Solid pieces, honest prices. Open any product to see it in 3D, place it in your own room and check it fits before you order.</p>
      <a class="btn" href="#collection">Shop the collection</a>
    </div>
  </section>

  <section id="collection" class="wrap section">
    <h2>The collection</h2>
    <div class="grid">${items.map(card).join('')}
    </div>
  </section>

  <section id="about" class="wrap section about">
    <h2>About us</h2>
    <p>We are a small Islamabad workshop. Our customers live in Lahore, Karachi, Peshawar and beyond, and cannot always visit the showroom. So every product page lets you see the piece in your own room first.</p>
  </section>

  <section id="delivery" class="wrap section about">
    <h2>Delivery</h2>
    <p>We deliver to 11 cities. Delivery cost depends on the city, the size of the piece and the floor, and you see it before you order.</p>
  </section>
</main>
${footer}
</body>
</html>
`,
)

// ------------------------------------------------------------- product pages
for (const p of items) {
  const sizesRows = p.sizes
    .map((s) => `<tr><th scope="row">${esc(s.label)}</th><td>${s.dims.w} × ${s.dims.d} × ${s.dims.h} cm</td><td class="num">${pkr(s.price)}</td></tr>`)
    .join('\n          ')
  const related = items.filter((x) => x.slug !== p.slug).slice(0, 3)
  writeFileSync(
    dir(`products/${p.slug}.html`),
    `${head(`${p.name} · Hearth & Home`, '../')}
<body>
${header('../')}
<main class="wrap product">
  <p class="crumbs"><a href="../index.html">Collection</a> / ${esc(p.name)}</p>
  <div class="product-grid">

    <!-- ===== RoomSense: the only integration on this page (plus the script tag at the bottom) ===== -->
    <div class="viewer">
      ${divTag(p.slug)}
    </div>
    <!-- ================================================================================================ -->

    <div class="info">
      <p class="eyebrow">${esc(p.category.replace('_', ' '))}</p>
      <h1>${esc(p.name)}</h1>
      <p class="big-price">from ${pkr(p.from)}</p>
      <p>${esc(p.description)}</p>
      <table class="sizes">
        <caption>Sizes and prices</caption>
        <tbody>
          ${sizesRows}
        </tbody>
      </table>
      <button class="btn" disabled>Add to cart (demo)</button>
      <p class="note">Delivery in ${p.leadDays} days${p.assemblyRequired ? ' · assembly included' : ''}. Use "View in your room" to check the fit and the delivery cost to your city.</p>
    </div>
  </div>

  <details class="how">
    <summary>How this page uses RoomSense</summary>
    <p>This website is plain HTML. It was not built with RoomSense. To add RoomSense, the store pasted two lines:</p>
    <pre><code>${esc(scriptTag)}
${esc(divTag(p.slug))}</code></pre>
    <p>The first line goes once in the site's template; the second goes where the product photos would be. RoomSense runs in an isolated frame, so it cannot change this page's design.</p>
  </details>

  <section class="section">
    <h2>You may also like</h2>
    <div class="grid">${related.map((r) => card(r).replace('href="products/', 'href="').replace('src="assets/', 'src="../assets/')).join('')}
    </div>
  </section>
</main>
${footer}
${scriptTag}
</body>
</html>
`,
  )
}

// ---------------------------------------------------------------- stylesheet
writeFileSync(
  dir('style.css'),
  `/* Hearth & Home: a deliberately different look from the RoomSense app and the other demo shops. */
:root {
  --green: #2f4a3a;
  --green-2: #3d5d49;
  --cream: #f7f2e8;
  --cream-2: #efe7d6;
  --ink: #26302a;
  --muted: #6a7469;
  --line: #ddd3bd;
  --card: #fffdf7;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--cream);
  color: var(--ink);
  font: 16px/1.6 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow-x: clip;
}
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; }
h1, h2, h3, .logo { font-family: Georgia, "Times New Roman", serif; font-weight: 600; line-height: 1.15; margin: 0; }
.wrap { width: min(1120px, 100% - 32px); margin-inline: auto; }

.banner { background: #1c231f; color: #d9dfd8; font-size: 12.5px; text-align: center; padding: 6px 16px; }
.site-header { background: var(--green); color: #f3ecd9; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; flex-wrap: wrap; padding-block: 8px; }
.logo { font-size: 24px; text-decoration: none; }
.logo span { color: #d9b36a; font-style: italic; }
.site-header nav { display: flex; gap: 22px; font-size: 15px; }
.site-header nav a { text-decoration: none; opacity: .9; }
.site-header nav a:hover { opacity: 1; text-decoration: underline; }
.cart { font-size: 14px; opacity: .9; }

.hero { padding: 64px 0 56px; background: linear-gradient(180deg, var(--cream-2), var(--cream)); border-bottom: 1px solid var(--line); }
.eyebrow { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; font-weight: 700; color: var(--green-2); margin: 0 0 10px; }
.hero h1 { font-size: clamp(34px, 6vw, 58px); max-width: 15ch; }
.hero h1 em { color: #a5702a; }
.lead { max-width: 52ch; font-size: 18px; color: #3d4a41; margin: 16px 0 26px; }
.btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 26px; border: 0; border-radius: 4px; background: var(--green); color: #fff; font: 600 15px/1 inherit; text-decoration: none; cursor: pointer; }
.btn:hover { background: var(--green-2); }
.btn:disabled { opacity: .55; cursor: not-allowed; }

.section { padding: 48px 0 8px; }
.section h2 { font-size: 30px; margin-bottom: 22px; }
.about p { max-width: 62ch; color: #3d4a41; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 20px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; text-decoration: none; transition: transform .15s ease, box-shadow .15s ease; }
.card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -18px rgba(38, 48, 42, .5); }
.card img { aspect-ratio: 4 / 3; width: 100%; object-fit: contain; background: #f1ebdc; padding: 10px; }
.card-body { padding: 14px 16px 18px; }
.card h3 { font-size: 18px; }
.price { margin: 6px 0 0; color: var(--green-2); font-weight: 600; }

.product { padding-bottom: 40px; }
.crumbs { font-size: 14px; color: var(--muted); margin: 22px 0 18px; }
.product-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 36px; align-items: start; }
.viewer { min-width: 0; }
.info h1 { font-size: clamp(28px, 4vw, 40px); }
.big-price { font-size: 24px; font-weight: 700; color: var(--green); margin: 8px 0 14px; }
.sizes { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px; background: var(--card); border: 1px solid var(--line); }
.sizes caption { text-align: left; font-weight: 700; padding: 0 0 8px; }
.sizes th, .sizes td { text-align: left; padding: 10px 12px; border-top: 1px solid var(--line); font-weight: 500; }
.sizes th { font-weight: 700; }
.sizes .num { text-align: right; white-space: nowrap; }
.note { font-size: 14px; color: var(--muted); }
.how { margin: 36px 0 0; padding: 16px 18px; background: var(--card); border: 1px solid var(--line); border-radius: 6px; }
.how summary { cursor: pointer; font-weight: 700; }
.how pre { overflow-x: auto; background: #1c231f; color: #e8e2d2; padding: 14px 16px; border-radius: 4px; font-size: 13px; }

.site-footer { margin-top: 56px; padding: 28px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }

@media (max-width: 820px) {
  .product-grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .site-header nav { order: 3; width: 100%; gap: 18px; }
  .hero { padding: 40px 0 36px; }
}
`,
)

console.log(`Generated ${items.length} product pages in examples/hearth-and-home`)
