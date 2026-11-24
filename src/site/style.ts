import type { RenderStyleId } from 'mochiz-world/catalog'

/** The four 3D styles shown on the site, in the site's order: Soft, Pixel, Flat and Plush. */
export const STYLES_SITE: { id: RenderStyleId; label: string }[] = [
  { id: '3d', label: 'Soft' },
  { id: 'pixel3d', label: 'Pixel' },
  { id: 'flat3d', label: 'Flat' },
  { id: 'plush', label: 'Plush' }
]
