import { createElement, useEffect, useRef, useState } from 'react'
import type { Product } from '../../data/types'
import { modelUrl } from '../../lib/catalogApi'

/**
 * Listing thumbnail. Uses a pre-rendered poster when the product has one;
 * otherwise renders the GLB in a non-interactive model-viewer, loaded only
 * when the card scrolls into view.
 */
export function ProductThumb({ product }: { product: Product }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (product.model.poster || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [product.model.poster])

  useEffect(() => {
    if (visible) void import('@google/model-viewer')
  }, [visible])

  if (product.model.poster) {
    return <img src={product.model.poster} alt={product.name} loading="lazy" className="h-full w-full object-contain p-3 mix-blend-multiply" />
  }
  return (
    <div ref={ref} className="h-full w-full">
      {visible &&
        createElement('model-viewer', {
          src: modelUrl(product.model.glb),
          alt: product.name,
          'camera-orbit': '30deg 75deg auto',
          'interaction-prompt': 'none',
          'disable-zoom': true,
          'shadow-intensity': '0.8',
          exposure: '1.05',
          loading: 'lazy',
          style: { width: '100%', height: '100%', background: 'transparent', pointerEvents: 'none', '--poster-color': 'transparent' },
        })}
    </div>
  )
}
