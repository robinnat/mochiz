/**
 * The Plush coat: settings and the pure parts of the fur (no Three.js here, so they run under Node).
 *
 * How the coat is drawn (`furCoat.ts`): the body mesh is drawn again a few times, each copy ("shell") pushed a little
 * further out along the normals and combed down. A shell only keeps the points where a lock of fur is tall enough to
 * reach it, so the stack of shells reads as a dense, short pile. The locks come from a 3D noise ANCHORED ON THE BODY
 * (model space), smeared along the comb direction, so they look brushed and never like dots. A few thousand thin
 * strands, rooted on the surface, add a soft fringe on the silhouette. Everything follows the engine's frame: the
 * shells reuse the body geometry of the frame, the strand roots are re-read from it every frame.
 *
 * Units are engine units (a Mochi is about 200 across, `RADIUS` 100).
 */

/** The coat at full detail. */
export interface FurSetting {
  /** height of the pile, engine units */
  length: number
  /** shells of pile above the undercoat */
  shells: number
  /** fringe strands at full detail */
  strands: number
  /** strand width at the root, engine units */
  strandWidth: number
  /** strand length, as a multiple of the pile height (min, max) */
  strandLength: [number, number]
}

/** Chosen by eye on the shapes sheet (24/11/2026): a short, dense pile; about 3 % of the body's width. */
export const FUR: FurSetting = {
  length: 6,
  shells: 10,
  strands: 2800,
  strandWidth: 0.7,
  strandLength: [1.1, 1.9]
}

/**
 * Pixels per engine unit at which the coat is drawn in full. Below, a Mochi gets fewer shells and fewer, wider strands
 * (covering the same), and a softer fine grain: the pile would be finer than the pixels that show it.
 */
export const FULL_DETAIL = 1.4

export interface FurDetail {
  shells: number
  strands: number
  strandWidth: number
  /** weight of the fine fiber grain (0..1): it fades on small Mochiz, where it would only shimmer */
  grain: number
}

/**
 * How much of the coat to draw at `pxPerUnit` (device) pixels per engine unit, under the page's load `level` (1 = full,
 * see `FUR_LEVELS`): fewer shells and strands when many Mochiz are drawn or frames come late.
 */
export function furDetail(pxPerUnit: number, level = 1, fur: FurSetting = FUR): FurDetail {
  const d = Math.max(0, Math.min(1, pxPerUnit / FULL_DETAIL))
  const share = Math.max(0.25, Math.sqrt(d)) * level
  const strands = Math.round(fur.strands * share)
  return {
    shells: Math.max(3, Math.ceil(fur.shells * d * level)),
    strands,
    // fewer strands, each wider by as much, so the fringe covers about the same
    strandWidth: fur.strandWidth * Math.min(2, fur.strands / Math.max(1, strands)),
    grain: Math.max(0, Math.min(1, (d - 0.35) / 0.5))
  }
}

/**
 * Load levels of the coat, shared by every Plush Mochi of the page: full, then about 60 %, then about a third of the
 * shells and strands. The page steps down one level when drawing all its Mochiz costs more than `FUR_DOWN_MS` per frame
 * (well before the adaptive cadence halves the frame rate, at 8 ms), and back up below `FUR_UP_MS`; at most one step
 * per `FUR_STEP_MS`, so the density never flickers.
 */
export const FUR_LEVELS = [1, 0.6, 0.35]
export const FUR_DOWN_MS = 5
export const FUR_UP_MS = 2.5
export const FUR_STEP_MS = 1500

export interface FurLoad {
  /** index in `FUR_LEVELS` */
  index: number
  /** time of the last step, ms */
  since: number
}

/** Next load level, from the average drawing time of a frame (`averageMs`, every Mochi) at time `now` (ms). */
export function nextFurLoad(load: FurLoad, averageMs: number, now: number): FurLoad {
  if (now - load.since < FUR_STEP_MS) return load
  if (averageMs > FUR_DOWN_MS && load.index < FUR_LEVELS.length - 1) return { index: load.index + 1, since: now }
  if (averageMs < FUR_UP_MS && load.index > 0) return { index: load.index - 1, since: now }
  return load
}

/** Small seeded generator (mulberry32): the coat is the same on every page load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Side of the noise cube the locks are read from. */
export const NOISE_SIDE = 32

/** A cube of random bytes (`side`^3), tiling: sampled with linear filtering it is a smooth value noise. */
export function noiseVolume(side = NOISE_SIDE, seed = 7): Uint8Array {
  const r = seeded(seed)
  const out = new Uint8Array(side * side * side)
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(r() * 256)
  return out
}

/**
 * Where the strands grow: `count` points spread over the surface by AREA (a big triangle gets more), each as a
 * triangle and barycentric weights, so it can be re-read from the mesh of any later frame with the same topology (the
 * body breathes, squashes and stretches: the roots go with it). Two random numbers per strand (length, bend).
 */
export interface RootPick {
  /** three vertex indices per root */
  corners: Uint32Array
  /** three weights per root (sum 1) */
  weights: Float32Array
  /** two random numbers per root, 0..1 */
  seeds: Float32Array
  count: number
}

export function pickRoots(pos: ArrayLike<number>, index: ArrayLike<number>, count: number, seed = 11): RootPick {
  const tris = Math.floor(index.length / 3)
  const cdf = new Float64Array(tris)
  let total = 0
  for (let t = 0; t < tris; t++) {
    const a = index[3 * t]! * 3
    const b = index[3 * t + 1]! * 3
    const c = index[3 * t + 2]! * 3
    const ux = pos[b]! - pos[a]!
    const uy = pos[b + 1]! - pos[a + 1]!
    const uz = pos[b + 2]! - pos[a + 2]!
    const vx = pos[c]! - pos[a]!
    const vy = pos[c + 1]! - pos[a + 1]!
    const vz = pos[c + 2]! - pos[a + 2]!
    const cx = uy * vz - uz * vy
    const cy = uz * vx - ux * vz
    const cz = ux * vy - uy * vx
    total += Math.hypot(cx, cy, cz) / 2
    cdf[t] = total
  }
  const r = seeded(seed)
  const corners = new Uint32Array(count * 3)
  const weights = new Float32Array(count * 3)
  const seeds = new Float32Array(count * 2)
  for (let i = 0; i < count && total > 0; i++) {
    const x = r() * total
    let lo = 0
    let hi = tris - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cdf[mid]! < x) lo = mid + 1
      else hi = mid
    }
    for (let k = 0; k < 3; k++) corners[3 * i + k] = index[3 * lo + k]!
    // uniform point in the triangle
    let s = r()
    let t = r()
    if (s + t > 1) {
      s = 1 - s
      t = 1 - t
    }
    weights[3 * i] = 1 - s - t
    weights[3 * i + 1] = s
    weights[3 * i + 2] = t
    seeds[2 * i] = r()
    seeds[2 * i + 1] = r()
  }
  return { corners, weights, seeds, count }
}

/**
 * Reads the roots off a frame's mesh: position, normal (normalized) and texture coordinates, into the strand
 * instance arrays (`root` 3, `normal` 3, `uv` 2 floats per strand). Only the first `n` roots.
 */
export function placeRoots(
  pick: RootPick,
  n: number,
  pos: ArrayLike<number>,
  nor: ArrayLike<number>,
  uv: ArrayLike<number>,
  root: Float32Array,
  normal: Float32Array,
  uvOut: Float32Array
) {
  const m = Math.min(n, pick.count)
  const C = pick.corners
  const W = pick.weights
  for (let i = 0; i < m; i++) {
    const a = C[3 * i]!
    const b = C[3 * i + 1]!
    const c = C[3 * i + 2]!
    const wa = W[3 * i]!
    const wb = W[3 * i + 1]!
    const wc = W[3 * i + 2]!
    let nx = 0
    let ny = 0
    let nz = 0
    for (let k = 0; k < 3; k++) {
      root[3 * i + k] = wa * pos[3 * a + k]! + wb * pos[3 * b + k]! + wc * pos[3 * c + k]!
    }
    nx = wa * nor[3 * a]! + wb * nor[3 * b]! + wc * nor[3 * c]!
    ny = wa * nor[3 * a + 1]! + wb * nor[3 * b + 1]! + wc * nor[3 * c + 1]!
    nz = wa * nor[3 * a + 2]! + wb * nor[3 * b + 2]! + wc * nor[3 * c + 2]!
    const l = Math.hypot(nx, ny, nz) || 1
    normal[3 * i] = nx / l
    normal[3 * i + 1] = ny / l
    normal[3 * i + 2] = nz / l
    uvOut[2 * i] = wa * uv[2 * a]! + wb * uv[2 * b]! + wc * uv[2 * c]!
    uvOut[2 * i + 1] = wa * uv[2 * a + 1]! + wb * uv[2 * b + 1]! + wc * uv[2 * c + 1]!
  }
}

/**
 * Comb direction at a point of the body (model space, y up): mostly DOWN, opening outwards on the sides, with a slow
 * wave so the coat is not combed with a ruler; then flattened onto the surface (tangent to it). Unit length. The
 * shader has the same function (`COMB_GLSL`); this twin is for the tests.
 */
export function combDirection(p: [number, number, number], n: [number, number, number]): [number, number, number] {
  const r = Math.max(1, Math.hypot(p[0], p[1]))
  const wave = 0.35 * Math.sin(0.045 * p[0] + 0.03 * p[2]) + 0.25 * Math.sin(0.05 * p[1] - 0.035 * p[2])
  let cx = (0.55 * p[0]) / r + wave
  let cy = -1
  let cz = 0
  const d = cx * n[0] + cy * n[1] + cz * n[2]
  cx -= n[0] * d
  cy -= n[1] * d
  cz -= n[2] * d
  const l = Math.hypot(cx, cy, cz)
  // at the very bottom the normal points down and nothing is left: comb outwards instead
  if (l < 1e-3) {
    const ox = p[0] / r
    const oy = p[1] / r
    const e = ox * n[0] + oy * n[1]
    const fx = ox - n[0] * e
    const fy = oy - n[1] * e
    const fz = -n[2] * e
    const fl = Math.hypot(fx, fy, fz) || 1
    return [fx / fl, fy / fl, fz / fl]
  }
  return [cx / l, cy / l, cz / l]
}

/** GLSL twin of `combDirection`. */
export const COMB_GLSL = /* glsl */ `
vec3 furComb(vec3 p, vec3 n) {
  float r = max(1.0, length(p.xy));
  float wave = 0.35 * sin(0.045 * p.x + 0.03 * p.z) + 0.25 * sin(0.05 * p.y - 0.035 * p.z);
  vec3 c = vec3(0.55 * p.x / r + wave, -1.0, 0.0);
  c -= n * dot(n, c);
  float l = length(c);
  if (l < 1e-3) {
    vec3 o = vec3(p.xy / r, 0.0);
    o -= n * dot(n, o);
    return normalize(o + vec3(1e-4));
  }
  return c / l;
}`
