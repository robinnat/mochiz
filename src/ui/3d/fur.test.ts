import { describe, expect, it } from 'vitest'
import {
  COMB_GLSL,
  combDirection,
  FULL_DETAIL,
  FUR,
  FUR_DOWN_MS,
  FUR_LEVELS,
  FUR_STEP_MS,
  FUR_UP_MS,
  furDetail,
  nextFurLoad,
  NOISE_SIDE,
  noiseVolume,
  pickRoots,
  placeRoots
} from './fur'
import { RADIUS } from '@/bot/frame'

/** The Plush coat (24/11/2026): the pure parts, run under Node. Shaders and meshes are in `furCoat.ts`. */
describe('fur settings', () => {
  it('a short pile: a few percent of the body, with a stack of shells and a fringe of strands', () => {
    expect(FUR.length).toBeGreaterThan(0)
    expect(FUR.length / (2 * RADIUS)).toBeLessThan(0.06)
    expect(FUR.shells).toBeGreaterThanOrEqual(6)
    expect(FUR.strands).toBeGreaterThan(0)
    expect(FUR.strandLength[0]).toBeLessThan(FUR.strandLength[1])
  })

  it('full detail from FULL_DETAIL pixels per unit; fewer shells and strands below, never under the floor', () => {
    const full = furDetail(FULL_DETAIL)
    expect(full.shells).toBe(FUR.shells)
    expect(full.strands).toBe(FUR.strands)
    expect(full.grain).toBe(1)
    expect(furDetail(FULL_DETAIL * 3)).toEqual(full)
    let prev = full
    for (const px of [1, 0.7, 0.5, 0.3, 0.1]) {
      const d = furDetail(px)
      expect(d.shells).toBeLessThanOrEqual(prev.shells)
      expect(d.strands).toBeLessThanOrEqual(prev.strands)
      // fewer strands are wider, so the fringe covers about the same
      expect(d.strandWidth).toBeGreaterThanOrEqual(prev.strandWidth)
      expect(d.shells).toBeGreaterThanOrEqual(3)
      prev = d
    }
    expect(furDetail(0.1).grain).toBe(0)
  })

  it('a lower load level draws fewer shells and strands', () => {
    const [a, b, c] = FUR_LEVELS.map((k) => furDetail(FULL_DETAIL, k))
    expect(b!.shells).toBeLessThan(a!.shells)
    expect(c!.shells).toBeLessThan(b!.shells)
    expect(c!.strands).toBeLessThan(b!.strands)
    expect(c!.shells).toBeGreaterThanOrEqual(3)
  })
})

describe('fur load level', () => {
  it('steps down when a frame costs too much, back up when it is cheap, at most one step per FUR_STEP_MS', () => {
    let l = { index: 0, since: -1e9 }
    l = nextFurLoad(l, FUR_DOWN_MS + 1, 0)
    expect(l.index).toBe(1)
    // too soon for another step
    expect(nextFurLoad(l, FUR_DOWN_MS + 10, FUR_STEP_MS / 2).index).toBe(1)
    l = nextFurLoad(l, FUR_DOWN_MS + 1, FUR_STEP_MS)
    expect(l.index).toBe(2)
    // never past the last level
    expect(nextFurLoad(l, 40, 10 * FUR_STEP_MS).index).toBe(FUR_LEVELS.length - 1)
    // between the two thresholds nothing moves (no flicker)
    expect(nextFurLoad(l, (FUR_UP_MS + FUR_DOWN_MS) / 2, 10 * FUR_STEP_MS)).toBe(l)
    l = nextFurLoad(l, FUR_UP_MS - 1, 10 * FUR_STEP_MS)
    expect(l.index).toBe(1)
  })
})

describe('noise', () => {
  it('is a seeded cube: the same coat on every page load', () => {
    const a = noiseVolume()
    expect(a).toHaveLength(NOISE_SIDE ** 3)
    expect(noiseVolume()).toEqual(a)
    expect(noiseVolume(NOISE_SIDE, 8)).not.toEqual(a)
    const mean = a.reduce((s, v) => s + v, 0) / a.length
    expect(mean).toBeGreaterThan(110)
    expect(mean).toBeLessThan(145)
  })
})

describe('strand roots', () => {
  // two triangles, the second 3 times larger
  const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 13, 0, 0, 10, 2, 0]
  const index = [0, 1, 2, 3, 4, 5]

  it('are spread by area, inside their triangle, the same every time', () => {
    const p = pickRoots(pos, index, 4000)
    let big = 0
    for (let i = 0; i < p.count; i++) {
      if (p.corners[3 * i] === 3) big++
      const w = [p.weights[3 * i]!, p.weights[3 * i + 1]!, p.weights[3 * i + 2]!]
      expect(w.every((x) => x >= -1e-6)).toBe(true)
      expect(w[0]! + w[1]! + w[2]!).toBeCloseTo(1, 5)
    }
    // areas 0.5 and 3: about 6 roots out of 7 in the big one
    expect(big / p.count).toBeGreaterThan(0.82)
    expect(big / p.count).toBeLessThan(0.89)
    expect(pickRoots(pos, index, 4000).weights).toEqual(p.weights)
  })

  it('are read back from a later frame of the same mesh (they move with it)', () => {
    const p = pickRoots(pos, index, 50)
    const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 2, 0, 0, 2]
    const uv = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]
    const root = new Float32Array(150)
    const normal = new Float32Array(150)
    const uvOut = new Float32Array(100)
    // the mesh moved up by 5
    const moved = pos.map((v, i) => (i % 3 === 1 ? v + 5 : v))
    placeRoots(p, 50, moved, nor, uv, root, normal, uvOut)
    for (let i = 0; i < 50; i++) {
      expect(root[3 * i + 1]!).toBeGreaterThanOrEqual(5 - 1e-5)
      expect(Math.hypot(normal[3 * i]!, normal[3 * i + 1]!, normal[3 * i + 2]!)).toBeCloseTo(1, 5)
      expect(uvOut[2 * i]! + uvOut[2 * i + 1]!).toBeLessThanOrEqual(1 + 1e-5)
    }
  })
})

describe('comb', () => {
  const norm = (v: number[]) => Math.hypot(...v)
  it('is a unit direction lying on the surface, combed down on the front and the sides', () => {
    const cases: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, 60], [0, 0, 1]],
      [[40, 20, 40], [0.6, 0.3, 0.74]],
      [[-80, -10, 0], [-1, 0, 0]],
      [[0, 90, 10], [0, 0.99, 0.14]]
    ]
    for (const [p, n0] of cases) {
      const l = norm(n0)
      const n = n0.map((v) => v / l) as [number, number, number]
      const c = combDirection(p, n)
      expect(norm(c)).toBeCloseTo(1, 5)
      expect(Math.abs(c[0] * n[0] + c[1] * n[1] + c[2] * n[2])).toBeLessThan(1e-6)
    }
    expect(combDirection([0, 0, 60], [0, 0, 1])[1]).toBeLessThan(-0.8)
    expect(combDirection([-80, -10, 0], [-1, 0, 0])[1]).toBeLessThan(-0.8)
  })

  it('still has a direction at the very bottom, where the normal points straight down', () => {
    const c = combDirection([30, -100, 0], [0, -1, 0])
    expect(norm(c)).toBeCloseTo(1, 5)
    expect(Math.abs(c[1])).toBeLessThan(1e-6)
  })

  it('the shader uses the same formula', () => {
    for (const bit of ['0.55 * p.x / r', '0.045 * p.x + 0.03 * p.z', '0.05 * p.y - 0.035 * p.z', 'vec3(0.55 * p.x / r + wave, -1.0, 0.0)']) {
      expect(COMB_GLSL).toContain(bit)
    }
  })
})
