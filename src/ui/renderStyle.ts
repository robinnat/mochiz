/**
 * RENDER style of the bot: Soft, Flat, Pixel or Plush, all in real 3D (WebGL, `src/ui/3d/`).
 *
 * Only the drawing changes. The engine (`src/bot/`), its five states and all its measurements stay the same:
 * `engine.sample(t)` gives the same frame, and `mochi-bot.ts` paints it differently. Hence this module in `src/ui/`
 * and not in `src/bot/`.
 *
 * The catalog only holds ids, like shapes and colors: labels are resolved by `t('styles.<id>')`, and the literal
 * union makes the compiler check that each one has its translation in the three languages.
 */

import { ref } from '@/ui/dom/reactive'
import { HALF_VIEWBOX, RADIUS } from '@/bot/frame'
import { LEGACY_PIXEL_SIZES } from '@/ui/legacy'

/**
 * The four styles, all in real 3D (WebGL): `3d` (Soft), `flat3d` (Flat), `pixel3d` (Pixel) and `plush` (Plush, the
 * Soft body in a coat of fur).
 */
export type RenderStyleId = '3d' | 'flat3d' | 'pixel3d' | 'plush'

/** The styles offered in the interface, the catalog and the docs. */
export const RENDER_STYLES: RenderStyleId[] = ['3d', 'flat3d', 'pixel3d']

/**
 * Styles that work (`render-style="plush"`) but are not offered yet: not in the catalog, the site or the docs until
 * the rendering is chosen (Plush, 24/11/2026). Moving one into `RENDER_STYLES` makes it public.
 */
export const PREVIEW_STYLES: RenderStyleId[] = ['plush']

/** Soft by default: the validated soft 3D. */
export const DEFAULT_RENDER_STYLE: RenderStyleId = '3d'

export const isRenderStyle = (v: string): v is RenderStyleId =>
  (RENDER_STYLES as string[]).includes(v) || (PREVIEW_STYLES as string[]).includes(v)

/**
 * 3D material of a style: Soft = the chosen one (`soft` by default), Flat = three tones, Pixel = low resolution +
 * palette, Plush = the Soft body with a coat of fur.
 */
export const materialFor = <T extends string>(r: RenderStyleId, soft: T): T | 'toon' | 'pixel' | 'plush' =>
  r === 'flat3d' ? 'toon' : r === 'pixel3d' ? 'pixel' : r === 'plush' ? 'plush' : soft

/* ----------------------------------------------------------------- pixel art */

/**
 * Pixel size of the Pixel style (`pixel3d`): it sets the resolution of its canvas. `large` was removed on 11/11/2026:
 * an old `large` falls back to `medium` (`effectivePixel`, and the migration of saved settings in `legacy.ts`).
 */
export type PixelSizeId = 'medium' | 'fine'

/**
 * Pixel size, given as the DIAMETER of the ball in pixels: that is what you see, "a 24-pixel ball", not a grid size
 * that includes the rings' margin.
 */
export const PIXEL_SIZES: { id: PixelSizeId; diameter: number }[] = [
  { id: 'medium', diameter: 24 },
  { id: 'fine', diameter: 32 }
]

/**
 * Pixel (3D): size of the low resolution canvas. The finest density (32 pixels across) is the default; `medium` is
 * the other choice.
 */
export const DEFAULT_PIXEL: PixelSizeId = 'fine'

export const isPixelSize = (v: string): v is PixelSizeId =>
  PIXEL_SIZES.some((p) => p.id === v)

/**
 * Side of the grid, in cells, over the WHOLE viewBox (±HALF_VIEWBOX): the rings and particles of animated states live
 * in the margin and must be pixelated too.
 */
export function pixelGrid(size: PixelSizeId): number {
  const d = PIXEL_SIZES.find((p) => p.id === size)?.diameter ?? 24
  return Math.round((d * HALF_VIEWBOX) / RADIUS)
}

/* ----------------------------------------------------------- current setting */

/**
 * The chosen style, shared by every DISPLAYED bot: thumbnails, timeline, sheet. `MochiBot` uses it when given no
 * explicit style, which avoids passing the prop through every component that mounts a thumbnail.
 *
 * Exports pass the style EXPLICITLY (`SettingsBot`): an off-screen instance must render exactly what it is asked, not
 * what the screen shows at that instant.
 */
export const currentRenderStyle = ref<RenderStyleId>(DEFAULT_RENDER_STYLE)
export const currentPixel = ref<PixelSizeId>(DEFAULT_PIXEL)

/** The style to render: the given one if known, else the current setting. */
export const effectiveRenderStyle = (r: string | undefined): RenderStyleId => (r && isRenderStyle(r) ? r : currentRenderStyle.value)
/**
 * The pixel size to render: the given one if known, an old id moved to its new one (`large` -> `medium`), else the
 * current setting.
 */
export function effectivePixel(p: string | undefined): PixelSizeId {
  if (!p) return currentPixel.value
  const v = LEGACY_PIXEL_SIZES[p] ?? p
  return isPixelSize(v) ? v : currentPixel.value
}

/** Added to the exported file name: the real style (`3d`, `flat3d`, `pixel3d`, `plush`). */
export const renderStyleSuffix = (r: RenderStyleId) => r
