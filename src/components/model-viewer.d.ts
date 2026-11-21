/**
 * JSX typing for the <model-viewer> custom element (React 19).
 * React 19 passes unknown props on custom elements as properties when the element
 * has a matching property, otherwise as attributes. So kebab-case attributes work as written.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { ModelViewerElement } from '@google/model-viewer'

type Bool = boolean | undefined

interface ModelViewerJSXAttributes extends DetailedHTMLProps<HTMLAttributes<ModelViewerElement>, ModelViewerElement> {
  src?: string
  poster?: string
  alt?: string
  loading?: 'auto' | 'lazy' | 'eager'
  reveal?: 'auto' | 'manual'
  'camera-controls'?: Bool
  'disable-zoom'?: Bool
  'disable-pan'?: Bool
  'touch-action'?: 'pan-y' | 'pan-x' | 'none'
  'auto-rotate'?: Bool
  'auto-rotate-delay'?: number | string
  'rotation-per-second'?: string
  'interaction-prompt'?: 'auto' | 'none'
  'interaction-prompt-threshold'?: number | string
  'camera-orbit'?: string
  'camera-target'?: string
  'field-of-view'?: string
  'min-camera-orbit'?: string
  'max-camera-orbit'?: string
  'interpolation-decay'?: number | string
  'shadow-intensity'?: number | string
  'shadow-softness'?: number | string
  'environment-image'?: string
  'skybox-image'?: string
  exposure?: number | string
  'tone-mapping'?: 'auto' | 'aces' | 'agx' | 'commerce' | 'neutral' | 'reinhard' | 'cineon' | 'linear' | 'none'
  scale?: string
  orientation?: string
  ar?: Bool
  'ar-modes'?: string
  'ar-scale'?: 'auto' | 'fixed'
  'ar-placement'?: 'floor' | 'wall'
  'ios-src'?: string
  'xr-environment'?: Bool
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerJSXAttributes
    }
  }
}
