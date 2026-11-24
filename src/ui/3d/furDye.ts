/**
 * How the Plush coat takes its color: one row of colors per dye, from the darkest recess to the brightest lit tip. The
 * shader works out how much light a fiber catches and looks the color up here, so every dye keeps its hue through the
 * same range of shading.
 *
 * Ported from open-bot-avatar (`packages/core/src/dom/fluffy/dye.ts` and the OKLCH helpers of `color.ts`),
 * Copyright (c) 2026 Dominik Scholz, MIT License (see LICENSE). Pure: no Three.js, tested under Node.
 */

export type Rgb = [number, number, number]

const toLinear = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** A color as OKLCH: lightness 0..1, chroma, hue in degrees. */
export function toOklch(c: Rgb): [number, number, number] {
  const [r, g, b] = c.map(toLinear) as Rgb
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return [L, Math.hypot(A, B), h < 0 ? h + 360 : h]
}

function oklchLinear(L: number, C: number, h: number): Rgb {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

/** An OKLCH color in sRGB (0..255), its chroma lowered as far as it takes to fit (lightness and hue are kept). */
export function oklch(L: number, C: number, h: number): Rgb {
  const fits = (c: number) => oklchLinear(L, c, h).every((v) => v >= -1e-4 && v <= 1 + 1e-4)
  let lo = 0
  let hi = C
  if (!fits(hi)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
    hi = lo
  }
  return oklchLinear(L, hi, h).map(fromLinear) as Rgb
}

/** Colors in a ramp. */
export const DYE_RAMP_SIZE = 96
/** Exposure at the bright end of a ramp; 1 is the dye's own color. */
export const DYE_RAMP_RANGE = 2.4

const ramps = new Map<number, Uint8Array>()

/** Keep regular lightness steps through the midtones, rolling off near black and white. */
function shoulder(distance: number, room: number): number {
  const knee = room / 2
  return distance <= knee ? distance : room - knee * Math.exp((knee - distance) / knee)
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

/**
 * The ramp for a body color, as RGBA bytes. RGB is the color at each exposure. Alpha, the same along the row, is how
 * far the shader replaces it with its separate response for yellow fibers.
 */
export function dyeRamp(rgb: Rgb): Uint8Array {
  const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
  const cached = ramps.get(key)
  if (cached) return cached
  const [lightness, chroma, hue] = toOklch(rgb)
  // Amber through lemon keep separate diffuse and glint colors, fading into the shared ramp for neighboring hues,
  // pale creams and dark olives.
  const yellow = (1 - smoothstep(22, 32, Math.abs(hue - 90))) * smoothstep(0.025, 0.085, chroma) * smoothstep(0.54, 0.75, lightness)
  // The dye bounds the brightest tip. Where a channel is already full, the other dyed channels lift more than the
  // weakest one.
  const value = Math.max(...rgb)
  const dye = rgb.map((channel) => (value ? channel / value : 1))
  const weakest = Math.min(...dye)
  const peak = dye.map((channel) => 255 * (channel + (1 - channel) * (0.16 + 0.84 * (channel - weakest)))) as Rgb
  const [peakLightness] = toOklch(peak)
  // Even black, white and fully saturated primaries need some headroom.
  const mid = Math.max(0.16, Math.min(lightness, peakLightness - 0.025))
  const midChroma = chroma * Math.min(1, mid / Math.max(0.001, lightness))
  const headroom = peakLightness - mid
  const row = new Uint8Array(DYE_RAMP_SIZE * 4)
  for (let i = 0; i < DYE_RAMP_SIZE; i++) {
    const exposure = ((i + 0.5) * DYE_RAMP_RANGE) / DYE_RAMP_SIZE
    // At fixed chromaticity, Oklab lightness scales with the cube root of linear light: carry the excursion of a
    // reference dye over to this one.
    const delta = 0.82 * (Math.cbrt(exposure) - 1)
    const L = delta < 0 ? mid - shoulder(-delta, mid) : mid + shoulder(delta, headroom)
    const [r, g, b] = oklch(L, midChroma * Math.min(1, L / mid), hue)
    row.set([Math.round(r), Math.round(g), Math.round(b), Math.round(255 * yellow)], i * 4)
  }
  if (ramps.size >= 64) ramps.delete(ramps.keys().next().value!)
  ramps.set(key, row)
  return row
}

/** `#rrggbb` to 0..255. */
export function rgbOf(hex: string): Rgb {
  const v = parseInt(hex.slice(1, 7), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
