import { describe, expect, it } from 'vitest'
import { BotEngine } from './engine'
import { RADIUS } from './frame'
import { SHAPES, SHAPE_BY_ID } from './skins'
import { PROFILE_SAMPLES } from './profiles'
import { PROFILES, bodyOutline, frontEyes, halfExtentEye, inflate, profileOf, vertices, centerOf } from '@/ui/3d/volume'
import { finesseOf, type Material } from '@/ui/3d/material'
import { HALF_VIEWBOX } from './frame'

/**
 * The ten shapes added on 24/11/2026. The shared checks (eyes inside the silhouette in every state and expression,
 * measured states untouched, same eye size, no shaking, closed volume, eyes on the face) run on them with the rest of
 * the catalog in `skins.test.ts` and `volume.test.ts`. Here: what is specific to them.
 */
const IDS = ['cat', 'bear', 'ghost', 'daifuku', 'pear', 'bean', 'riceball', 'gem', 'mushroom', 'bell']
const FIRST = SHAPES.slice(0, 12)
const ADDED = SHAPES.slice(12)

describe('new shapes', () => {
  it('ten shapes, in the public catalog after the first twelve, all with new ids', () => {
    expect(SHAPES).toHaveLength(22)
    expect(ADDED.map((s) => s.id)).toEqual(IDS)
    expect(FIRST.at(-1)!.id).toBe('heart')
    expect(new Set(SHAPES.map((s) => s.id)).size).toBe(SHAPES.length)
    for (const id of IDS) expect(SHAPE_BY_ID.get(id)).toBeDefined()
  })

  it('same visual weight as the first twelve: a full profile, largest radius between 1 and the squircle', () => {
    const catalogMax = Math.max(...FIRST.flatMap((s) => s.radii))
    for (const s of ADDED) {
      expect(s.radii, s.id).toHaveLength(PROFILE_SAMPLES)
      expect(s.radii.every((r) => Number.isFinite(r) && r > 0.25), s.id).toBe(true)
      const max = Math.max(...s.radii)
      expect(max, s.id).toBeGreaterThanOrEqual(1)
      expect(max, s.id).toBeLessThanOrEqual(catalogMax)
    }
  })

  it('each one has its own volume profile (none falls back to the default cushion)', () => {
    for (const id of IDS) expect(PROFILES[id], id).toBeDefined()
  })

  it('symmetric left and right (the eyes sit straight on every one)', () => {
    for (const s of ADDED) {
      const n = s.radii.length
      // sample k is at angle 2 pi k / n, y down: the mirror of k is n/2 - k
      for (let k = 0; k < n; k++) {
        const m = (((n / 2 - k) % n) + n) % n
        expect(Math.abs(s.radii[k]! - s.radii[m]!), `${s.id} ${k}`).toBeLessThan(0.02)
      }
    }
  })

  // Flat, Pixel and Soft draw the same mesh (only lowpoly, internal, coarsens it): every new shape, every style
  const STYLES: Material[] = ['soft', 'toon', 'pixel']
  it.each(IDS.flatMap((id) => STYLES.map((m) => [id, m] as const)))('%s in %s: a closed volume with both eyes on the face', (id, m) => {
    const frame = new BotEngine(RADIUS, 'idle', SHAPE_BY_ID.get(id)!.radii, null).sample(0.5)
    const pts = bodyOutline(frame.bodyPath)
    const v = inflate(pts, HALF_VIEWBOX, undefined, finesseOf(m), profileOf(id))
    expect(v.positions.length).toBe(vertices(pts.length, finesseOf(m).rings) * 3)
    expect([...v.positions].every(Number.isFinite)).toBe(true)
    const half = frame.eyes.map((e) => halfExtentEye(e.d, 'matrix(1 0 0 1 0 0)'))
    const eyes = frontEyes(pts, half, profileOf(id))
    expect(eyes).toHaveLength(2)
    expect(eyes[0]!.y).toBeLessThan(centerOf(pts).y + 10)
  })
})
