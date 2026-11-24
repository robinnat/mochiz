import { describe, expect, it } from 'vitest'
import { SHAPES_3D, SHAPE_ID_LIST, SITE_MOODS, INTERACTIONS_SITE, PALETTE_SITE } from './catalog'
import { contrast } from '@/ui/3d/theme'
import { ACCESSORIES } from '@/bot/slots'
import { MOOD_IDS } from '@/bot/moods'

describe('site catalog', () => {
  it('the engine\'s 7 moods are all on the site, in order', () => {
    expect(SITE_MOODS.map((h) => h.id)).toEqual(MOOD_IDS)
    expect(SITE_MOODS).toHaveLength(7)
  })

  it('each accessory of the catalog has an English name', () => {
    for (const a of ACCESSORIES) expect(a.name, a.id).toMatch(/^[A-Z][a-z]+( [a-z]+)*$/)
  })

  it('the site texts have no em dash and no accent (English)', () => {
    const texts = [...SITE_MOODS.flatMap((h) => [h.label, h.text]), ...INTERACTIONS_SITE.flatMap((i) => [i.gesture, i.name, i.text])]
    for (const t of texts) {
      expect(t).not.toMatch(/[\u2014\u2013]/)
      expect(t).not.toMatch(/[\u00e0-\u00ff]/)
    }
  })

  it('the site shows the 22 shapes, in the catalog order, each with a color of the palette', () => {
    expect(SHAPES_3D).toHaveLength(22)
    expect(SHAPES_3D.map((f) => f.id)).toEqual(SHAPE_ID_LIST)
    expect(SHAPE_ID_LIST).toContain('heart')
    const colors = SHAPES_3D.map((f) => f.color.toLowerCase())
    // the first twelve keep twelve different tints
    expect(new Set(colors.slice(0, 12)).size).toBe(12)
    for (const c of colors) expect(PALETTE_SITE.map((p) => p.hex)).toContain(c)
  })

  it('two shapes side by side or one above the other never share a color, in 6 columns and in 3', () => {
    const colors = SHAPES_3D.map((f) => f.color.toLowerCase())
    for (const cols of [6, 3]) {
      colors.forEach((c, i) => {
        if (i % cols > 0) expect(c, `${SHAPES_3D[i]!.id} left, ${cols} columns`).not.toBe(colors[i - 1])
        if (i >= cols) expect(c, `${SHAPES_3D[i]!.id} above, ${cols} columns`).not.toBe(colors[i - cols])
      })
    }
  })

  it('the example palette: at least 12 distinct tints, readable on a light AND a dark background', () => {
    expect(PALETTE_SITE.length).toBeGreaterThanOrEqual(12)
    expect(new Set(PALETTE_SITE.map((p) => p.hex)).size).toBe(PALETTE_SITE.length)
    for (const { name, hex } of PALETTE_SITE) {
      expect(hex, name).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrast(hex, '#fffdf9'), `${name} on light`).toBeGreaterThan(1.3)
      expect(contrast(hex, '#15141b'), `${name} on dark`).toBeGreaterThan(3)
    }
  })
})
