import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FUR,
  FUR_DOWN_MS,
  FUR_LEVELS,
  FUR_SCALE,
  FUR_STEP_MS,
  FUR_UP_MS,
  furDetail,
  nextFurLoad,
  pickRoots,
  rootCount,
  rootsIn,
  ROOT_SIDE,
  rootVolume,
  surfaceArea
} from './fur'
import { beadInk, DYE_RAMP_RANGE, DYE_RAMP_SIZE, dyeRamp, oklch, rgbOf, toOklch } from './furDye'
import { DARK_EYE, eyeColor, THEMES } from './theme'
import { exposedHeight, signedField, socketRect } from './furSocket'

/**
 * The Plush coat v2 (24/11/2026, technique of open-bot-avatar's "fluffy", MIT, Dominik Scholz): the pure parts, run
 * under Node. Shaders and meshes are in `furCoat.ts`.
 */
describe('fur settings', () => {
  it('their proportions: a 200-wide Mochi is about as wide in their units as their avatars', () => {
    expect(200 / FUR_SCALE).toBeGreaterThan(65)
    expect(200 / FUR_SCALE).toBeLessThan(90)
    expect(FUR.shells).toBe(5)
    expect(FUR.density).toBe(3.3)
    expect(FUR.strandShare).toBeGreaterThan(0)
    expect(FUR.strandShare).toBeLessThanOrEqual(1)
  })

  it('full detail on a big Mochi; fewer shells and fewer, wider strands on a small one', () => {
    const full = furDetail(10)
    expect(full.shells).toBe(FUR.shells)
    expect(full.passes).toBe(Math.ceil(FUR.passes * FUR.strandShare))
    let prev = full
    for (const px of [0.8, 0.5, 0.3, 0.1]) {
      const d = furDetail(px)
      expect(d.shells).toBeLessThanOrEqual(prev.shells)
      expect(d.passes).toBeLessThanOrEqual(prev.passes)
      // fewer strands are wider: the same coverage
      expect(d.strandWidth * d.passes).toBeCloseTo(FUR.passes, 6)
      expect(d.shells).toBeGreaterThanOrEqual(2)
      expect(d.passes).toBeGreaterThanOrEqual(1)
      prev = d
    }
  })

  it('a lower load level draws fewer shells and strands', () => {
    const [a, b, c] = FUR_LEVELS.map((k) => furDetail(10, k))
    expect(b!.shells).toBeLessThan(a!.shells)
    expect(c!.shells).toBeLessThanOrEqual(b!.shells)
    expect(c!.passes).toBeLessThan(a!.passes)
  })

  it('roots drawn in passes: a prefix of the list, the whole list at every pass', () => {
    expect(rootsIn(800, FUR.passes)).toBe(800)
    expect(rootsIn(800, FUR.passes / 2)).toBe(400)
    expect(rootsIn(803, 1)).toBe(101)
  })

  it(`${FUR.density} strands per square unit of theirs`, () => {
    expect(rootCount(FUR_SCALE ** 2 * 1000)).toBe(Math.round(1000 * FUR.density))
  })
})

describe('fur load level', () => {
  it('steps down when a frame costs too much, back up when it is cheap, at most one step per FUR_STEP_MS', () => {
    let l = { index: 0, since: -1e9 }
    l = nextFurLoad(l, FUR_DOWN_MS + 1, 0)
    expect(l.index).toBe(1)
    expect(nextFurLoad(l, FUR_DOWN_MS + 10, FUR_STEP_MS / 2).index).toBe(1)
    l = nextFurLoad(l, FUR_DOWN_MS + 1, FUR_STEP_MS)
    expect(l.index).toBe(2)
    expect(nextFurLoad(l, 40, 10 * FUR_STEP_MS).index).toBe(FUR_LEVELS.length - 1)
    expect(nextFurLoad(l, (FUR_UP_MS + FUR_DOWN_MS) / 2, 10 * FUR_STEP_MS)).toBe(l)
    expect(nextFurLoad(l, FUR_UP_MS - 1, 10 * FUR_STEP_MS).index).toBe(1)
  })

  it('a single Mochi in full detail (about 5 ms with its sync) does not lower the coat', () => {
    expect(FUR_DOWN_MS).toBeGreaterThan(6)
  })
})

describe('root volume', () => {
  it('is seeded: the same coat on every page load', () => {
    const a = rootVolume()
    expect(a).toHaveLength(ROOT_SIDE ** 3)
    expect(rootVolume()).toEqual(a)
    const mean = a.reduce((s, v) => s + v, 0) / a.length
    expect(mean).toBeGreaterThan(115)
    expect(mean).toBeLessThan(140)
  })
})

describe('strand roots', () => {
  const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 13, 0, 0, 10, 2, 0]
  const index = [0, 1, 2, 3, 4, 5]

  it('area of a mesh', () => {
    expect(surfaceArea(pos, index)).toBeCloseTo(3.5, 6)
  })

  it('are spread by area, inside their triangle, the same every time', () => {
    const p = pickRoots(pos, index, 4000)
    let big = 0
    for (let i = 0; i < p.count; i++) {
      if (p.corners[3 * i] === 3) big++
      const w = [p.weights[3 * i]!, p.weights[3 * i + 1]!, p.weights[3 * i + 2]!]
      expect(w.every((x) => x >= -1e-6)).toBe(true)
      expect(w[0]! + w[1]! + w[2]!).toBeCloseTo(1, 5)
    }
    expect(big / p.count).toBeGreaterThan(0.82)
    expect(big / p.count).toBeLessThan(0.89)
    expect(pickRoots(pos, index, 4000).weights).toEqual(p.weights)
  })
})

describe('dye ramp', () => {
  it('one row of colors per dye, from dark to bright, its own color near exposure 1', () => {
    const red = rgbOf('#ff3b30')
    const ramp = dyeRamp(red)
    expect(ramp).toHaveLength(DYE_RAMP_SIZE * 4)
    const L = (i: number) => toOklch([ramp[i * 4]!, ramp[i * 4 + 1]!, ramp[i * 4 + 2]!])[0]
    for (let i = 1; i < DYE_RAMP_SIZE; i++) expect(L(i)).toBeGreaterThanOrEqual(L(i - 1) - 1e-3)
    const one = Math.floor(DYE_RAMP_SIZE / DYE_RAMP_RANGE)
    const at = toOklch([ramp[one * 4]!, ramp[one * 4 + 1]!, ramp[one * 4 + 2]!])
    const own = toOklch(red)
    expect(Math.abs(at[2] - own[2])).toBeLessThan(6)
    expect(Math.abs(at[0] - own[0])).toBeLessThan(0.06)
  })

  it('yellows keep their separate response, blues do not', () => {
    expect(dyeRamp(rgbOf('#ffd60a'))[3]).toBeGreaterThan(100)
    expect(dyeRamp(rgbOf('#2d5bff'))[3]).toBe(0)
  })

  it('OKLCH round trip', () => {
    for (const c of [rgbOf('#ff3b30'), rgbOf('#00c46a'), rgbOf('#8b3dff')]) {
      const [l, ch, h] = toOklch(c)
      const back = oklch(l, ch, h)
      for (let k = 0; k < 3; k++) expect(Math.abs(back[k]! - c[k]!)).toBeLessThan(1.5)
    }
  })
})

describe('eye sockets', () => {
  it('signed distance: below 0.5 inside an eye, above outside, growing away from it', () => {
    const w = 40
    const h = 20
    const cov = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - 10) ** 2 + (y - 10) ** 2 < 25) cov[y * w + x] = 255
    const f = signedField(cov, w, h, 0.5, 3.8)
    expect(f[10 * w + 10]!).toBeLessThan(128)
    expect(f[10 * w + 20]!).toBeGreaterThan(128)
    expect(f[10 * w + 20]!).toBeGreaterThanOrEqual(f[10 * w + 17]!)
  })

  it('the field box holds both eyes and is twice as wide as high', () => {
    const r = socketRect([{ x: -20, y: -10, r: 12 }, { x: 22, y: -10, r: 12 }], 10)!
    expect(r.w).toBeCloseTo(2 * r.h, 6)
    expect(r.x0).toBeLessThanOrEqual(-42)
    expect(r.x0 + r.w).toBeGreaterThanOrEqual(44)
    expect(socketRect([], 10)).toBeNull()
  })

  it('an open bead is partly buried in the pile', () => {
    expect(exposedHeight(10, 10)).toBeCloseTo(0.8, 6)
    expect(exposedHeight(10, 25)).toBeCloseTo(0.625, 6)
  })
})

/**
 * Plush bead eyes follow the eye rule of every style (Robin, 26/11/2026): WHITE in the light theme, BLACK in the dark
 * one, from the same source (`eyeColor` in `theme.ts`). Only the bead shading is Plush's own.
 */
describe('plush bead color', () => {
  const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
  const PAPER = '#f9f9f9'

  it('is the theme eye color: white (the paper) in light, black in dark', () => {
    expect(beadInk(eyeColor('light', PAPER))).toEqual(rgbOf(PAPER).map((v) => v / 255))
    expect(beadInk(eyeColor('dark', PAPER))).toEqual(rgbOf(DARK_EYE).map((v) => v / 255))
    for (const theme of THEMES) {
      const lightest = Math.min(...beadInk(eyeColor(theme, PAPER)))
      const darkest = Math.max(...beadInk(eyeColor(theme, PAPER)))
      if (theme === 'light') expect(lightest).toBeGreaterThan(0.95)
      else expect(darkest).toBeLessThan(0.05)
    }
  })

  it('the scene hands the coat the eye color it paints the other styles with', () => {
    const scene = read('./scene3d.ts')
    const update = scene.slice(scene.indexOf('  update(frame: BotFrame, color: string, paper: string)'))
    // the theme's eye color is computed once, then given to the painted eyes AND to the coat's beads
    expect(update.indexOf('paper = eyeColor(this.theme, paper)')).toBeGreaterThan(0)
    expect(update).toMatch(/this\.coat\.update\(mt\.geo, color, paper, /)
  })

  it('the coat keeps no bead color of its own', () => {
    const coat = read('./furCoat.ts')
    expect(coat).not.toMatch(/const INK\b/)
    expect(coat).not.toMatch(/in both themes/)
    expect(coat).toMatch(/u\.uInk!\.value = beadInk\(eye\)/)
  })
})
