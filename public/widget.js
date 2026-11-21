/*!
 * RoomSense widget – add 3D, AR and room-fit to any furniture product page.
 *
 *   <script src="https://YOUR-ROOMSENSE-HOST/widget.js" defer></script>
 *   <div data-roomsense data-store="your-store" data-product="product-slug"></div>
 *
 * Optional attributes on the div:
 *   data-mode="button" | "inline" | "both"   (default "both": 3D viewer + button)
 *   data-color="#1d2a26"                     button colour (defaults to the store's)
 *   data-label="View in your room"           button text
 *   data-height="420"                        inline viewer height in px
 *
 * The widget renders inside a Shadow DOM and iframes, so the host site's CSS
 * cannot break it and it cannot break the host site.
 */
(function () {
  'use strict'
  if (window.RoomSense && window.RoomSense.__loaded) return

  var script = document.currentScript
  var ORIGIN = script && script.src ? new URL(script.src).origin : location.origin
  var ALLOW = 'xr-spatial-tracking; camera; fullscreen; gyroscope; accelerometer; magnetometer; web-share; clipboard-write'
  var openOverlay = null

  function embedUrl(store, product, params) {
    var u = new URL(ORIGIN + '/embed/' + encodeURIComponent(store) + '/' + encodeURIComponent(product))
    u.searchParams.set('host', location.hostname || 'local')
    Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]) })
    return u.toString()
  }

  var css =
    ':host{all:initial;display:block;font-family:Manrope,ui-sans-serif,system-ui,sans-serif}' +
    '.wrap{display:flex;flex-direction:column;gap:10px}' +
    '.frame{width:100%;border:0;border-radius:16px;background:#f3efe8;display:block}' +
    '.btn{appearance:none;border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px;' +
    'min-height:48px;padding:0 20px;border-radius:999px;color:#fff;font:600 15px/1 Manrope,ui-sans-serif,system-ui,sans-serif;' +
    'box-shadow:0 1px 2px rgba(0,0,0,.08),0 10px 24px -12px rgba(0,0,0,.45);transition:transform .15s ease,filter .15s ease;width:100%}' +
    '.btn:hover{filter:brightness(1.08)}.btn:active{transform:scale(.98)}' +
    '.btn:focus-visible{outline:2px solid #c8653a;outline-offset:3px}' +
    '.sub{font:500 12px/1.3 Manrope,ui-sans-serif,system-ui,sans-serif;color:#6b7470;text-align:center}' +
    '.sub b{color:#1d2a26}' +
    '@media (prefers-reduced-motion:reduce){.btn{transition:none}}'

  var icon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M12 8l4 2.2v4.6L12 17l-4-2.2v-4.6L12 8Z"/></svg>'

  function mount(el) {
    if (el.__roomsense) return
    var store = el.getAttribute('data-store')
    var product = el.getAttribute('data-product')
    if (!store || !product) {
      console.warn('[RoomSense] data-store and data-product are required', el)
      return
    }
    el.__roomsense = true
    var mode = el.getAttribute('data-mode') || 'both'
    var color = el.getAttribute('data-color') || '#1d2a26'
    var label = el.getAttribute('data-label') || 'View in your room'
    var height = parseInt(el.getAttribute('data-height') || '420', 10)

    var root = el.attachShadow ? el.attachShadow({ mode: 'open' }) : el
    var style = document.createElement('style')
    style.textContent = css
    root.appendChild(style)
    var wrap = document.createElement('div')
    wrap.className = 'wrap'
    root.appendChild(wrap)

    if (mode === 'inline' || mode === 'both') {
      var frame = document.createElement('iframe')
      frame.className = 'frame'
      frame.title = 'Interactive 3D view'
      frame.loading = 'lazy'
      frame.style.height = height + 'px'
      frame.setAttribute('allow', ALLOW)
      frame.src = embedUrl(store, product, { view: 'inline' })
      wrap.appendChild(frame)
    }
    if (mode === 'button' || mode === 'both') {
      var btn = document.createElement('button')
      btn.className = 'btn'
      btn.type = 'button'
      btn.style.background = color
      btn.innerHTML = icon + '<span></span>'
      btn.querySelector('span').textContent = label
      btn.addEventListener('click', function () { open(store, product) })
      wrap.appendChild(btn)
      var sub = document.createElement('p')
      sub.className = 'sub'
      sub.innerHTML = '3D &middot; AR &middot; Will it fit? &middot; Delivery cost &mdash; by <b>RoomSense</b>'
      wrap.appendChild(sub)
    }
  }

  function open(store, product, step) {
    close()
    var lastFocus = document.activeElement
    var overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'RoomSense')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;background:rgba(20,26,24,.55);display:flex;align-items:stretch;justify-content:center;' +
      'padding:env(safe-area-inset-top) 0 0 0;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)'
    var frame = document.createElement('iframe')
    frame.title = 'RoomSense: see it in your room'
    frame.setAttribute('allow', ALLOW)
    frame.setAttribute('allowfullscreen', '')
    frame.src = embedUrl(store, product, step ? { step: step } : {})
    var wide = window.matchMedia('(min-width: 900px)').matches
    frame.style.cssText =
      'border:0;background:#f6f3ee;width:100%;height:100%;' +
      (wide ? 'max-width:1180px;margin:24px;height:calc(100% - 48px);border-radius:22px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5)' : '')
    overlay.appendChild(frame)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    document.body.appendChild(overlay)
    var prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    frame.focus()
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    openOverlay = {
      el: overlay,
      cleanup: function () {
        document.removeEventListener('keydown', onKey)
        document.documentElement.style.overflow = prevOverflow
        if (lastFocus && lastFocus.focus) lastFocus.focus()
      },
    }
  }

  function close() {
    if (!openOverlay) return
    openOverlay.el.remove()
    openOverlay.cleanup()
    openOverlay = null
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data !== 'object') return
    if (e.data.type === 'roomsense:close') close()
    if (e.data.type === 'roomsense:open' && e.data.store && e.data.product) open(e.data.store, e.data.product, e.data.step)
  })

  function scan(rootNode) {
    var nodes = (rootNode || document).querySelectorAll('[data-roomsense]')
    for (var i = 0; i < nodes.length; i++) mount(nodes[i])
  }

  window.RoomSense = { __loaded: true, open: open, close: close, scan: scan }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan() })
  else scan()
  // single-page shops add product pages without reloading
  new MutationObserver(function () { scan() }).observe(document.documentElement, { childList: true, subtree: true })
})()
