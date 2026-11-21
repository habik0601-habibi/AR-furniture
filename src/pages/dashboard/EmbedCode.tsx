import { useState } from 'react'
import { Button, Card, Field, Notice, Segmented, inputClass } from '../../components/ui'
import type { DashboardCtx } from './Dashboard'

export function EmbedCode({ ctx }: { ctx: DashboardCtx }) {
  const [product, setProduct] = useState(ctx.products[0]?.slug ?? 'product-slug')
  const [mode, setMode] = useState<'both' | 'button' | 'inline'>('both')
  const [copied, setCopied] = useState<string | null>(null)
  const origin = window.location.origin
  const scriptTag = `<script src="${origin}/widget.js" defer></script>`
  const divTag = `<div data-roomsense data-store="${ctx.store.slug}" data-product="${product}"${mode !== 'both' ? ` data-mode="${mode}"` : ''} data-color="${ctx.store.brand_color}"></div>`

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl">Embed code</h1>
      <p className="mt-1 text-sm text-ink-2">Two lines add RoomSense to any product page: Shopify, WooCommerce or a custom site.</p>

      <Card className="mt-6 p-5">
        <p className="text-sm font-bold">1. Once, in your site's theme (before &lt;/body&gt;)</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-ink p-4 text-[13px] text-paper">{scriptTag}</pre>
        <Button size="sm" variant="outline" icon="copy" className="mt-2" onClick={() => copy(scriptTag, 'script')}>{copied === 'script' ? 'Copied' : 'Copy'}</Button>
      </Card>

      <Card className="mt-4 p-5">
        <p className="text-sm font-bold">2. On each product page, where the images are</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Product">
            <select className={inputClass} value={product} onChange={(e) => setProduct(e.target.value)}>
              {ctx.products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </Field>
          <div>
            <p className="text-sm font-semibold">Show</p>
            <Segmented className="mt-1.5" label="Widget mode" value={mode} onChange={setMode} options={[{ value: 'both', label: '3D + button' }, { value: 'button', label: 'Button' }, { value: 'inline', label: '3D only' }]} />
          </div>
        </div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-ink p-4 text-[13px] text-paper">{divTag}</pre>
        <Button size="sm" variant="outline" icon="copy" className="mt-2" onClick={() => copy(divTag, 'div')}>{copied === 'div' ? 'Copied' : 'Copy'}</Button>
        <p className="mt-4 text-xs text-muted">
          On a product template, replace the product slug with your platform's variable, for example <code>{'{{ product.handle }}'}</code> on Shopify.
        </p>
      </Card>

      <Notice className="mt-4" tone="info" title="Isolation">
        The widget runs in a Shadow DOM and iframes, so your site's CSS cannot break it and it cannot affect your pages.
      </Notice>
    </div>
  )
}
