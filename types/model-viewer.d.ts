import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        poster?: string
        alt?: string
        loading?: 'eager' | 'lazy'
        reveal?: 'auto' | 'interaction' | 'manual'
        'camera-controls'?: boolean | string
        'auto-rotate'?: boolean | string
        'auto-rotate-delay'?: string
        'rotation-per-second'?: string
        'touch-action'?: string
        'shadow-intensity'?: string
        'environment-image'?: string
        exposure?: string
        ar?: boolean | string
        [key: string]: any
      }
    }
  }
}

export {}

