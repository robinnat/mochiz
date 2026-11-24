/**
 * Plush eyes are beads seated in sockets pressed into the coat. A socket follows its eye's contour through every shape
 * the eye takes (blink, smile, moods), so the shader reads the contours as a small signed distance field over the face.
 *
 * The distance sweep is ported from open-bot-avatar (`packages/core/src/dom/fluffy/socket.ts`), Copyright (c) 2026
 * Dominik Scholz, MIT License (see LICENSE). Here one rectangular field covers both eyes (our eyes are painted by the
 * engine in a mask, not described as marks). Pure: no DOM, no Three.js.
 */

/** Width and height of the field, pixels (2:1, both eyes side by side). */
export const SOCKET_W = 160
export const SOCKET_H = 80

/**
 * Signed distance to the eyes' contours from a coverage image (0..255, 255 inside an eye), in units of `2 * pad`
 * around 0.5 (inside is below 0.5), one byte per pixel. `unitsPerPx`: size of a pixel in the units of `pad`.
 */
export function signedField(coverage: Uint8Array, w: number, h: number, unitsPerPx: number, pad: number): Uint8Array {
  const n = w * h
  // start on each side of the antialiased boundary, then sweep the distance out both ways
  const distance = new Float32Array(n).fill(w + h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const a = coverage[i]! / 255
      const inside = a >= 0.5
      if (
        (a > 0 && a < 1) ||
        coverage[i - 1]! >= 128 !== inside ||
        coverage[i + 1]! >= 128 !== inside ||
        coverage[i - w]! >= 128 !== inside ||
        coverage[i + w]! >= 128 !== inside
      ) {
        distance[i] = Math.abs(a - 0.5)
      }
    }
  }
  for (const step of [1, -1]) {
    for (let j = 1; j < h - 1; j++) {
      for (let k = 1; k < w - 1; k++) {
        const i = step === 1 ? j * w + k : (h - 1 - j) * w + (w - 1 - k)
        const prev = i - w * step
        distance[i] = Math.min(distance[i]!, distance[i - step]! + 1, distance[prev]! + 1, distance[prev - 1]! + Math.SQRT2, distance[prev + 1]! + Math.SQRT2)
      }
    }
  }
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const signed = ((coverage[i]! >= 128 ? -1 : 1) * distance[i]! * unitsPerPx)
    out[i] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + signed / (2 * pad))))
  }
  return out
}

/** Box around the eyes, engine units: `x0, y0` top left, `w` = 2 `h` (the field's aspect). */
export interface SocketRect {
  x0: number
  y0: number
  w: number
  h: number
}

/** The 2:1 box holding every eye disc (center, radius) plus `pad` around. */
export function socketRect(eyes: Array<{ x: number; y: number; r: number }>, pad: number): SocketRect | null {
  if (!eyes.length) return null
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const e of eyes) {
    x0 = Math.min(x0, e.x - e.r - pad)
    x1 = Math.max(x1, e.x + e.r + pad)
    y0 = Math.min(y0, e.y - e.r - pad)
    y1 = Math.max(y1, e.y + e.r + pad)
  }
  let w = x1 - x0
  let h = y1 - y0
  // grow the short side so the box is 2:1 (square pixels in the field)
  if (w < 2 * h) {
    x0 -= (2 * h - w) / 2
    w = 2 * h
  } else {
    y0 -= (w / 2 - h) / 2
    h = w / 2
  }
  return { x0, y0, w, h }
}

/** The share of a bead's height that shows: an open bead is partly buried (ported from `socket.ts`). */
export function exposedHeight(w: number, h: number): number {
  const openness = Math.max(0, Math.min(1, h / w - 1))
  return 0.8 - 0.175 * openness
}
