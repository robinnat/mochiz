/**
 * The Plush coat (v2, 24/11/2026): settings and the pure parts of the fur (no Three.js here, so they run under Node).
 *
 * The technique is open-bot-avatar's "fluffy" material (Dominik Scholz, MIT License, see LICENSE), ported to our
 * Three.js scene (`furCoat.ts`): the body drawn with the eyes seated in it, a few shells of pile lifted off it, and tens
 * of thousands of single strands over the WHOLE body, all reading the same model-space pile, so the coat holds
 * together as the Mochi turns. What differs: our body changes every frame (breathing, squash, morph), so the strands
 * are rooted on triangles of the body mesh and read their position from it on the GPU every frame; and the detail also
 * follows the page's load (`FUR_LEVELS`).
 */

/**
 * Scale between our engine units and open-bot-avatar's (a 100-unit viewBox, a body about 77 wide): a Mochi is 200
 * wide. Their shader runs in their units, so the pile has their proportions.
 */
export const FUR_SCALE = 2.6

/** The coat at full detail, in THEIR units (see `FUR_SCALE`). */
export const FUR = {
  /** shells of pile between the body and the strands */
  shells: 5,
  /** hair roots per square unit of surface */
  density: 3.3,
  /** roots are drawn in this many interleaved passes: a small Mochi draws only some of them, wider */
  passes: 8,
  /** pixels per unit from which the coat is drawn in full (a 128 px avatar on a 2x display, for them) */
  fullDetail: 2.56,
  /** how far around an eye the coat is pressed down */
  socketPad: 3.8,
  /**
   * Share of the strands drawn at full detail (not in the original, which renders a coat once per view; we draw every
   * frame): the others are covered by drawing these wider, as their own level of detail does.
   */
  strandShare: 0.5
}

export interface FurDetail {
  shells: number
  /** roots drawn, out of `FUR.passes` passes */
  passes: number
  /** width of a strand: as much wider as there are fewer */
  strandWidth: number
}

/**
 * How much of the coat to draw at `pxPerUnit` (device) pixels per OUR unit, under the page's load `level` (1 = full,
 * see `FUR_LEVELS`). Ported from open-bot-avatar's `fluffyDetail`: a small avatar gets fewer shells and a share of
 * its strands, each widened by as much, so they cover the same; the load level takes a further share.
 */
export function furDetail(pxPerUnit: number, level = 1): FurDetail {
  const detail = Math.min(1, (pxPerUnit * FUR_SCALE) / FUR.fullDetail)
  const shells = Math.max(2, Math.ceil(FUR.shells * detail * level))
  // by the root, not in proportion: strands that get much wider show as wisps along the outline
  const passes = Math.max(1, Math.ceil(FUR.passes * FUR.strandShare * Math.sqrt(detail) * level))
  return { shells, passes, strandWidth: FUR.passes / passes }
}

/** How many of `total` roots the first `passes` passes hold (roots are stored pass after pass). */
export function rootsIn(total: number, passes: number): number {
  let count = 0
  for (let pass = 0; pass < passes; pass++) count += Math.max(0, Math.ceil((total - pass) / FUR.passes))
  return count
}

/**
 * Load levels of the coat, shared by every Plush Mochi of the page: full, then about 60 %, then about a third of the
 * shells and strands. The page steps down one level when drawing all its Mochiz costs more than `FUR_DOWN_MS` per frame
 * (well before the adaptive cadence halves the frame rate, at 8 ms), and back up below `FUR_UP_MS`; at most one step
 * per `FUR_STEP_MS`, so the density never flickers.
 */
export const FUR_LEVELS = [1, 0.6, 0.35]
export const FUR_DOWN_MS = 7
export const FUR_UP_MS = 3.5
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

/** Side of the cube of root density the pile is read from. */
export const ROOT_SIDE = 64

/**
 * Random root density in a repeating cube: a volume has no UV seams or poles. Same generator and seed as
 * open-bot-avatar's `rootVolume` (MIT, Dominik Scholz).
 */
export function rootVolume(side = ROOT_SIDE): Uint8Array {
  const roots = new Uint8Array(side ** 3)
  let seed = 73021
  for (let i = 0; i < roots.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    roots[i] = seed >>> 24
  }
  return roots
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

/** Area of a triangle mesh (positions, indices), in square units of the positions. */
export function surfaceArea(pos: ArrayLike<number>, index: ArrayLike<number>): number {
  let total = 0
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]! * 3
    const b = index[t + 1]! * 3
    const c = index[t + 2]! * 3
    const ux = pos[b]! - pos[a]!
    const uy = pos[b + 1]! - pos[a + 1]!
    const uz = pos[b + 2]! - pos[a + 2]!
    const vx = pos[c]! - pos[a]!
    const vy = pos[c + 1]! - pos[a + 1]!
    const vz = pos[c + 2]! - pos[a + 2]!
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
  }
  return total
}

/** Strands for a body of `area` square OUR units: `FUR.density` per square unit of theirs. */
export const rootCount = (area: number) => Math.round((area / FUR_SCALE ** 2) * FUR.density)
