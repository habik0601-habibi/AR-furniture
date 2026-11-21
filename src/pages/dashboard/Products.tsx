import { useState } from 'react'
import type { Category } from '../../engine/types'
import type { Finish, Product, SizeOption } from '../../data/types'
import { db } from '../../lib/supabase'
import { productToRow, type StoreProduct } from '../../lib/catalogApi'
import { pkr } from '../../engine/pricing'
import { Icon } from '../../components/Icon'
import { Badge, Button, Card, Field, Notice, inputClass } from '../../components/ui'
import { inspectGlb, type GlbInfo } from './inspectGlb'
import type { DashboardCtx } from './Dashboard'

const CATEGORIES: Category[] = ['sofa', 'armchair', 'bed', 'wardrobe', 'dining_table', 'dining_chair', 'coffee_table', 'tv_unit', 'side_table', 'bookshelf', 'desk', 'dresser']

export function Products({ ctx }: { ctx: DashboardCtx }) {
  const [editing, setEditing] = useState<StoreProduct | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(p: StoreProduct) {
    const { error } = await db.from('products').update({ active: !p.active }).eq('id', p.dbId)
    if (error) return setError(error.message)
    await ctx.reload()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Products</h1>
          <p className="mt-1 text-sm text-ink-2">{ctx.products.length} products · prices, sizes, finishes and 3D models</p>
        </div>
        <Button icon="plus" variant="primary" onClick={() => setAdding(true)}>Add product</Button>
      </div>
      {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
      {adding && <AddProduct ctx={ctx} onClose={() => setAdding(false)} />}
      {editing && <EditProduct key={editing.dbId} product={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await ctx.reload() }} />}

      <Card className="mt-6 divide-y divide-line">
        {ctx.products.map((p) => (
          <div key={p.dbId} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {p.name} {!p.active && <Badge tone="warn" className="ml-1">Hidden</Badge>}
              </p>
              <p className="text-sm text-ink-2">
                <span className="capitalize">{p.category.replace('_', ' ')}</span> · {p.sizes.length} sizes · {p.finishes.length} finishes · from{' '}
                {pkr(Math.min(...p.sizes.map((s) => s.price)))}
              </p>
            </div>
            <Button size="sm" variant="outline" icon={p.active ? 'eye' : 'eye'} onClick={() => toggle(p)}>{p.active ? 'Hide' : 'Show'}</Button>
            <Button size="sm" variant="ink" onClick={() => setEditing(p)}>Edit</Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

function EditProduct({ product, onClose, onSaved }: { product: StoreProduct; onClose(): void; onSaved(): void }) {
  const [name, setName] = useState(product.name)
  const [description, setDescription] = useState(product.description)
  const [sizes, setSizes] = useState<SizeOption[]>(product.sizes)
  const [finishes, setFinishes] = useState<Finish[]>(product.finishes)
  const [leadDays, setLeadDays] = useState(product.leadDays)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    const { error } = await db
      .from('products')
      .update({ name: name.trim(), description: description.trim(), sizes, finishes, lead_days: leadDays })
      .eq('id', product.dbId)
    setBusy(false)
    if (error) setError(error.message)
    else onSaved()
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">Edit {product.name}</h2>
        <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-paper-2"><Icon name="x" /></button>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Delivery lead time" hint="days"><input className={inputClass} type="number" min={0} max={120} value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} /></Field>
        <div className="sm:col-span-2">
          <Field label="Description"><textarea className={`${inputClass} h-20 py-2`} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
      </div>
      <h3 className="mt-6 font-sans text-sm font-bold tracking-normal">Sizes</h3>
      <div className="mt-2 space-y-2">
        {sizes.map((s, i) => (
          <div key={s.id} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_repeat(3,80px)_130px]">
            <input aria-label="Size label" className={inputClass} value={s.label} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            {(['w', 'd', 'h'] as const).map((k) => (
              <input key={k} aria-label={`${k} in cm`} className={inputClass} type="number" value={s.dims[k]} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, dims: { ...x.dims, [k]: Number(e.target.value) } } : x)))} />
            ))}
            <input aria-label="Price in rupees" className={inputClass} type="number" value={s.price} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)))} />
          </div>
        ))}
        <p className="text-xs text-muted">Width × depth × height in cm, then price in rupees. The 3D model scales to each size automatically.</p>
      </div>
      <h3 className="mt-6 font-sans text-sm font-bold tracking-normal">Finishes</h3>
      <div className="mt-2 space-y-2">
        {finishes.map((f, i) => (
          <div key={f.id} className="flex items-center gap-2">
            <input aria-label="Colour" type="color" value={f.color} onChange={(e) => setFinishes(finishes.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="h-11 w-12 shrink-0 rounded-lg border border-line bg-card p-1" />
            <input aria-label="Finish name" className={inputClass} value={f.name} onChange={(e) => setFinishes(finishes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <input aria-label="Surcharge in rupees" className={`${inputClass} w-32 shrink-0`} type="number" value={f.priceDelta} onChange={(e) => setFinishes(finishes.map((x, j) => (j === i ? { ...x, priceDelta: Number(e.target.value) } : x)))} />
            <button aria-label={`Remove ${f.name}`} disabled={finishes.length <= 1} onClick={() => setFinishes(finishes.filter((_, j) => j !== i))} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-paper-2 disabled:opacity-30"><Icon name="trash" size={18} /></button>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon="plus" onClick={() => setFinishes([...finishes, { id: `f${Date.now()}`, name: 'New finish', kind: finishes[0]?.kind ?? 'fabric', color: '#8a8a8a', priceDelta: 0 }])}>Add finish</Button>
      </div>
      {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
      <div className="mt-6 flex gap-2">
        <Button busy={busy} onClick={save} variant="primary">Save changes</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  )
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function AddProduct({ ctx, onClose }: { ctx: DashboardCtx; onClose(): void }) {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<GlbInfo | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Category>('sofa')
  const [price, setPrice] = useState(100000)
  const [tint, setTint] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick(f: File | null) {
    setFile(f)
    setInfo(null)
    setError(null)
    if (!f) return
    if (f.size > 15 * 1024 * 1024) return setError('Model is larger than 15 MB. Compress it first (see README: gltf-transform).')
    try {
      const i = await inspectGlb(f)
      setInfo(i)
      setTint(i.materials.slice(0, 1))
      if (!name) setName(f.name.replace(/\.glb$/i, '').replace(/[-_]/g, ' '))
    } catch (e) {
      setError(`Could not read this GLB: ${(e as Error).message}`)
    }
  }

  async function create() {
    if (!file || !info) return
    setBusy(true)
    setError(null)
    const slug = slugify(name)
    const path = `${ctx.store.id}/${slug}-${Date.now()}.glb`
    const up = await db.storage.from('models').upload(path, file, { contentType: 'model/gltf-binary', upsert: false })
    if (up.error) {
      setBusy(false)
      return setError(up.error.message)
    }
    const url = db.storage.from('models').getPublicUrl(path).data.publicUrl
    const dims = { w: Math.round(info.size.w), d: Math.round(info.size.d), h: Math.round(info.size.h) }
    const product: Product = {
      id: slug,
      slug,
      name: name.trim(),
      category,
      description: '',
      sizes: [{ id: 'standard', label: 'Standard', dims, price, packed: { w: dims.w + 10, d: dims.d + 10, h: dims.h + 10 }, weightKg: 40 }],
      finishes: [{ id: 'original', name: 'As shown', kind: 'fabric', color: '#ffffff', priceDelta: 0 }],
      model: { glb: url, native: dims, tintMaterials: tint },
      hotspots: [],
      styles: [],
      assemblyRequired: false,
      removableLegs: false,
      leadDays: 7,
      credit: { title: name.trim(), author: ctx.store.name, license: 'Store-owned', url: '' },
    }
    const { error } = await db.from('products').insert(productToRow(product, ctx.store.id, ctx.products.length + 1))
    setBusy(false)
    if (error) return setError(error.message)
    await ctx.reload()
    onClose()
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">Add a product</h2>
        <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full hover:bg-paper-2"><Icon name="x" /></button>
      </div>
      <p className="mt-1 text-sm text-ink-2">Upload a GLB model. RoomSense reads its real size and materials so AR shows it at true scale.</p>
      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-paper p-6 text-center hover:border-ink-2">
        <Icon name="upload" size={24} />
        <span className="font-semibold">{file ? file.name : 'Choose a .glb file'}</span>
        <span className="text-xs text-muted">Up to 15 MB · Y-up, metres, front facing +Z</span>
        <input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </label>
      {info && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Notice tone="good" title="Model read" className="sm:col-span-2">
            {Math.round(info.size.w)} × {Math.round(info.size.d)} × {Math.round(info.size.h)} cm · {info.triangles.toLocaleString()} triangles · {info.materials.length} materials
          </Notice>
          <Field label="Product name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Price" hint="rupees"><input className={inputClass} type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></Field>
          <fieldset>
            <legend className="text-sm font-semibold">Materials that take the finish colour</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {info.materials.map((m) => (
                <label key={m} className="flex min-h-9 items-center gap-2 rounded-full bg-paper-2 px-3 text-sm">
                  <input type="checkbox" checked={tint.includes(m)} onChange={(e) => setTint(e.target.checked ? [...tint, m] : tint.filter((x) => x !== m))} />
                  {m || '(unnamed)'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
      <div className="mt-5 flex gap-2">
        <Button variant="primary" disabled={!info || name.trim().length < 2} busy={busy} onClick={create}>Upload and add</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  )
}
