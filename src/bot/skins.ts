import { PROFILE_SAMPLES } from './profiles'
import type { Point } from './shape'
import {
  hullOfCircles,
  profileFromPolygon,
  regularPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile
} from './shape'

/**
 * Shapes and colors offered by the bot's customizer.
 *
 * Unlike the animation silhouettes (`profiles.ts`), these are NOT measured off the video: they are built analytically
 * from the original customizer's grid. Two separate sources on purpose: animated states must stay true to the video,
 * base shapes are a user choice.
 */

/**
 * Ids are listed rather than inferred from the array: that lets the i18n layer check AT COMPILE TIME that every shape
 * has its translation in the three languages (`t(\`shapes.${id}\`)` only compiles if the key exists). An `as const`
 * on the array would do the same but make `radii` read-only, while the engine passes it as is.
 */
export type ShapeId =
  | 'circle'
  | 'pebble'
  | 'squircle'
  | 'capsule'
  | 'triangle'
  | 'hexagon'
  | 'cloud'
  | 'drop'
  | 'star'
  | 'flower'
  | 'egg'
  | 'heart'
  | 'cat'
  | 'bear'
  | 'ghost'
  | 'daifuku'
  | 'pear'
  | 'bean'
  | 'riceball'
  | 'gem'
  | 'mushroom'
  | 'bell'

export interface BotShape {
  id: ShapeId
  radii: number[]
}

/** Scales the largest radius to `max` so every shape has the same visual weight. */
function normalize(radii: number[], max = 1): number[] {
  const peak = Math.max(...radii)
  if (peak <= 0) return radii
  const k = max / peak
  return radii.map((r) => r * k)
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * Math.PI * 2)

/** Pebble: a circle bent by two low harmonics, so irregular but smooth. */
const pebble = normalize(
  ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
  1.02
)

/** Cloud: a union of bumps, wide at the bottom, two lobes at the top. */
const cloud = normalize(
  unionOfCirclesProfile([
    { x: -0.44, y: 0.2, r: 0.54 },
    { x: 0.46, y: 0.2, r: 0.5 },
    { x: 0.02, y: 0.3, r: 0.6 },
    { x: -0.24, y: -0.3, r: 0.48 },
    { x: 0.3, y: -0.24, r: 0.44 }
  ]),
  1.02
)

/** Drop: a big disc at the bottom, a sharp tip at the top. */
const droplet = normalize(
  profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0),
  1.04
)

/**
 * Circular smoothing of a profile: a Gaussian weighted mean over neighboring samples. Rounds the tips and hollows of
 * a polygon without changing its overall shape, which keeps the eyes readable and the morph soft.
 */
function smooth(radii: number[], sigma: number): number[] {
  const n = radii.length
  const span = Math.ceil(sigma * 3)
  const w = Array.from({ length: span * 2 + 1 }, (_, i) => Math.exp(-((i - span) ** 2) / (2 * sigma * sigma)))
  const total = w.reduce((a, b) => a + b, 0)
  return radii.map((_, k) => {
    let acc = 0
    for (let i = -span; i <= span; i++) acc += radii[(k + i + n) % n]! * w[i + span]!
    return acc / total
  })
}

/**
 * Five-pointed star, one tip up. Clear branches with ROUNDED TIPS (hollows at 0.5 of the tip, smoothing 1.0: design
 * choice of 03/11/2026). The volume stays thick with softened edges (`volume.ts`); the eyes shrink to fit in the
 * center.
 */
const star = normalize(
  smooth(
    profileFromPolygon(
      Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 === 0 ? 1 : 0.6
        return { x: Math.cos(a) * r, y: Math.sin(a) * r }
      }),
      0,
      0
    ),
    2.0
  ),
  1.1
)

/** Flower: five round petals around a wide center, one petal up. */
const flower = normalize(
  unionOfCirclesProfile([
    { x: 0, y: 0, r: 0.66 },
    ...Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      return { x: Math.cos(a) * 0.56, y: Math.sin(a) * 0.56, r: 0.44 }
    })
  ]),
  1.06
)

/** Egg: standing, wider at the bottom than at the top. */
const egg = normalize(
  profileFromPolygon(
    Array.from({ length: 160 }, (_, i) => {
      const t = (i / 160) * Math.PI * 2
      return { x: 0.8 * Math.cos(t) * (1 + 0.14 * Math.sin(t)), y: Math.sin(t) }
    }),
    0,
    0.06
  ),
  1.06
)

/**
 * Heart: the classic curve (16 sin^3 t, 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t), flipped for the screen (y down),
 * seen from a center a little below the notch so each ray crosses the outline only once. Soft dip at the top, ROUNDED
 * tip at the bottom (smoothing), two full lobes: the eyes fit in the wide part. Inflated like the other shapes
 * (`volume.ts`, cushion profile).
 */
const heart = normalize(
  smooth(
    profileFromPolygon(
      Array.from({ length: 200 }, (_, i) => {
        const t = (i / 200) * Math.PI * 2
        return {
          x: (16 * Math.sin(t) ** 3) / 17,
          y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17
        }
      }),
      0,
      0.12
    ),
    1.6
  ),
  1.06
)

/**
 * Union of shapes seen from the center: per direction, the farthest edge. Exact when every part contains the center or
 * overlaps one that does along each ray (ears on a head); a small gap would be filled, never left as a hole.
 */
function unionProfiles(...profiles: number[][]): number[] {
  return profiles[0]!.map((_, i) => Math.max(...profiles.map((p) => p[i]!)))
}

/** Points of an ellipse centered at (cx, cy), clockwise on screen. */
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 160): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) }
  })
}

/* ---------------------------------------------------------------- the ten shapes added on 24/11/2026 */

/** Cat: a round head, a little wider than high, and two pointed ears with soft tips. */
const cat = normalize(
  smooth(
    unionProfiles(
      profileFromPolygon(ellipse(0, 0.14, 0.95, 0.8), 0, 0),
      profileFromPolygon([{ x: 0.24, y: -0.5 }, { x: 0.66, y: -1.02 }, { x: 0.86, y: -0.2 }], 0, 0),
      profileFromPolygon([{ x: -0.86, y: -0.2 }, { x: -0.66, y: -1.02 }, { x: -0.24, y: -0.5 }], 0, 0)
    ),
    1.3
  ),
  1.08
)

/** Bear: a round head and two round ears on top. */
const bear = normalize(
  smooth(
    unionOfCirclesProfile([
      { x: 0, y: 0.12, r: 0.86 },
      { x: -0.62, y: -0.58, r: 0.32 },
      { x: 0.62, y: -0.58, r: 0.32 }
    ]),
    1.0
  ),
  1.06
)

/** Ghost: a round dome, straight sides, and a hem of three round scallops at the bottom. */
const ghost = normalize(
  smooth(
    profileFromPolygon(
      [
        // dome, left to right over the top (y down)
        ...Array.from({ length: 60 }, (_, i) => {
          const a = Math.PI + (i / 59) * Math.PI
          return { x: 0.84 * Math.cos(a), y: -0.12 + 0.84 * Math.sin(a) }
        }),
        { x: 0.84, y: 0.62 },
        // hem, right to left: three scallops hanging down
        ...Array.from({ length: 91 }, (_, i) => {
          const u = i / 90
          const x = 0.84 - 1.68 * u
          return { x, y: 0.62 + 0.24 * Math.abs(Math.sin(3 * Math.PI * u)) }
        })
      ],
      0,
      0
    ),
    1.2
  ),
  1.06
)

/** Daifuku (the mochi sweet): a wide soft dome on a flat bottom, like a filled rice cake resting on a plate. */
const daifuku = normalize(
  profileFromPolygon(
    Array.from({ length: 200 }, (_, i) => {
      const t = (i / 200) * Math.PI * 2
      const s = Math.sin(t)
      // top: a full dome; bottom: almost flat with round corners
      return { x: 1.04 * Math.cos(t), y: s < 0 ? 0.26 + 0.98 * s : 0.26 + 0.46 * s ** 0.55 }
    }),
    0,
    0
  ),
  1.08
)

/** Pear: a big round bottom, a smaller top and a soft waist between them. */
const pear = normalize(
  smooth(
    unionOfCirclesProfile([
      { x: 0, y: 0.3, r: 0.72 },
      { x: 0, y: -0.48, r: 0.46 }
    ]),
    2.2
  ),
  1.06
)

/** Bean: lying, wider than high, a gentle dent in the middle of the top. */
const bean = normalize(
  smooth(
    profileFromPolygon(
      Array.from({ length: 200 }, (_, i) => {
        const t = (i / 200) * Math.PI * 2
        const x = 1.0 * Math.cos(t)
        let y = 0.66 * Math.sin(t)
        if (y < 0) y += 0.2 * Math.exp(-((x / 0.38) ** 2))
        return { x, y }
      }),
      0,
      0.04
    ),
    1.0
  ),
  1.08
)

/** Rice ball (onigiri): a triangle much rounder than the pyramid, thick and soft. */
const riceball = normalize(regularPolygonProfile(3, 1.1, 0.62, -90), 1.08)

/** Gem: a flat top, two shoulders and a soft point at the bottom, like a cut stone. */
const gem = normalize(
  smooth(
    profileFromPolygon(
      [
        { x: -0.52, y: -0.64 },
        { x: 0.52, y: -0.64 },
        { x: 0.98, y: -0.18 },
        { x: 0, y: 0.98 },
        { x: -0.98, y: -0.18 }
      ],
      0,
      0
    ),
    1.4
  ),
  1.08
)

/** Mushroom: a wide round cap over a short, thick stem. */
const mushroom = normalize(
  smooth(
    unionProfiles(
      profileFromPolygon(ellipse(0, -0.2, 1.04, 0.62), 0, 0),
      profileFromPolygon(ellipse(0, 0.36, 0.6, 0.56), 0, 0)
    ),
    2.0
  ),
  1.08
)

/** Bell: a dome that flares out into a wide, round rim at the bottom. */
const bell = normalize(
  smooth(
    profileFromPolygon(
      Array.from({ length: 200 }, (_, i) => {
        const t = (i / 200) * Math.PI * 2
        const s = Math.sin(t)
        const c = Math.cos(t)
        // width grows towards the bottom (flare), the bottom is a gentle curve
        const flare = 0.6 + 0.48 * Math.max(0, s) ** 1.2
        return { x: flare * c, y: s < 0 ? 0.12 + 0.92 * s : 0.12 + 0.56 * s ** 2.2 }
      }),
      0,
      0
    ),
    1.0
  ),
  1.06
)

/** Lying capsule: hull of two discs side by side. */
const capsule = profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0)

export const SHAPES: BotShape[] = [
  { id: 'circle', radii: new Array(PROFILE_SAMPLES).fill(1) },
  { id: 'pebble', radii: pebble },
  // 1.15 and not 1.02: on a superellipse the largest radius is the diagonal,
  // so normalizing on it gives a shape that looks smaller than the circle.
  { id: 'squircle', radii: normalize(superellipseProfile(3.3), 1.15) },
  { id: 'capsule', radii: capsule },
  // -90deg: a vertex towards the top of the screen (y points down)
  { id: 'triangle', radii: regularPolygonProfile(3, 1.12, 0.34, -90) },
  // 0deg: vertices left and right, so flat top and bottom edges
  { id: 'hexagon', radii: regularPolygonProfile(6, 1.04, 0.26, 0) },
  { id: 'cloud', radii: cloud },
  { id: 'drop', radii: droplet },
  { id: 'star', radii: star },
  { id: 'flower', radii: flower },
  { id: 'egg', radii: egg },
  { id: 'heart', radii: heart },
  // added on 24/11/2026
  { id: 'cat', radii: cat },
  { id: 'bear', radii: bear },
  { id: 'ghost', radii: ghost },
  { id: 'daifuku', radii: daifuku },
  { id: 'pear', radii: pear },
  { id: 'bean', radii: bean },
  { id: 'riceball', radii: riceball },
  { id: 'gem', radii: gem },
  { id: 'mushroom', radii: mushroom },
  { id: 'bell', radii: bell }
]

// Map keyed by `string`, not `ShapeId`: callers query with
// a value read back from localStorage or a prop, so not validated.
export const SHAPE_BY_ID = new Map<string, BotShape>(SHAPES.map((s) => [s.id, s]))
export const DEFAULT_SHAPE = 'circle'

export type ColorId =
  | 'ink'
  | 'cream'
  | 'brown'
  | 'red'
  | 'coral'
  | 'orange'
  | 'amber'
  | 'lime'
  | 'apple'
  | 'green'
  | 'turquoise'
  | 'sky'
  | 'blue'
  | 'violet'
  | 'magenta'
  | 'pink'
  | 'cherry'
  | 'gray'

export interface BotColor {
  id: ColorId
  hex: string
}

/** Customizer palette: 14 bright "Candy and toys" colors (P1, 09/11/2026) and four neutrals. */
export const COLORS: BotColor[] = [
  { id: 'ink', hex: '#0a0a0c' },
  { id: 'brown', hex: '#8b5e3c' },
  { id: 'red', hex: '#ff3b30' },
  { id: 'coral', hex: '#ff6a3d' },
  { id: 'orange', hex: '#ff9500' },
  { id: 'amber', hex: '#ffd60a' },
  { id: 'lime', hex: '#b6e800' },
  { id: 'apple', hex: '#6fd400' },
  { id: 'green', hex: '#00c46a' },
  { id: 'turquoise', hex: '#00c7be' },
  { id: 'sky', hex: '#21b0ff' },
  { id: 'blue', hex: '#2d5bff' },
  { id: 'violet', hex: '#8b3dff' },
  { id: 'magenta', hex: '#d81bbd' },
  { id: 'pink', hex: '#ff4d94' },
  { id: 'cherry', hex: '#e6194b' },
  { id: 'gray', hex: '#a3a3a3' },
  { id: 'cream', hex: '#f1efe9' }
]

export const COLOR_BY_ID = new Map<string, BotColor>(COLORS.map((c) => [c.id, c]))
export const DEFAULT_COLOR = 'ink'

/**
 * Free color: `#rgb` or `#rrggbb` (any case, `#` optional when typed) -> lowercase `#rrggbb`; `null` if it is not a
 * color. Used by the `color` prop (catalog id OR hex) and the site's hex field.
 */
export function isValidHex(v: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v ?? '').trim())
  if (!m) return null
  const h = m[1]!.toLowerCase()
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`
}

/** Body color: a catalog id, else a free hex, else ink. */
export const colorOf = (v: string): string => COLOR_BY_ID.get(v)?.hex ?? isValidHex(v) ?? '#0a0a0c'

/** Mixes two hex colors. Used for the depth haze of particles. */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string) => {
    const v = parseInt(h.slice(1), 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const a = parse(from)
  const b = parse(to)
  const c = a.map((x, i) => Math.round(x + (b[i]! - x) * t))
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
