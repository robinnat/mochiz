import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIGURES } from './catalog'
import { ACCESSORIES } from '@/bot/slots'
import { MOOD_IDS } from '@/bot/moods'
import { SHAPES } from '@/bot/skins'
import { RENDER_STYLES } from '@/ui/renderStyle'

const folder = new URL('./', import.meta.url)
const pages = readdirSync(folder).filter((f) => /^[A-Z].*\.ts$/.test(f))
const read = (f: string) => readFileSync(new URL(f, folder), 'utf8')

describe('site v10', () => {
  it('no em dash or en dash in the pages', () => {
    for (const f of [...pages, 'catalog.ts']) expect(read(f), f).not.toMatch(/[\u2014\u2013]/)
  })

  it('the hero figures come from the catalogs', () => {
    const v = Object.fromEntries(FIGURES.map((c) => [c.label, c.value]))
    expect(v.shapes).toBe(SHAPES.length)
    expect(v.moods).toBe(MOOD_IDS.length)
    expect(v.accessories).toBe(ACCESSORIES.length)
    expect(v['3D styles']).toBe(RENDER_STYLES.length)
    expect(RENDER_STYLES.length).toBe(4)
  })

  it('motion goes through transform/opacity and respects prefers-reduced-motion', () => {
    const css = read('site.css')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    // no animation of properties that force layout
    for (const k of css.matchAll(/@keyframes [a-z]+ \{([\s\S]*?)\n\}/g)) expect(k[1]!, k[0].slice(0, 30)).not.toMatch(/\b(top|left|width|height|margin|padding):/)
    const motion = read('motion.ts')
    expect(motion).toContain('IntersectionObserver')
    expect(motion).toContain('prefers-reduced-motion')
  })

  it('three and the 3D stay dynamic imports in the site', () => {
    for (const f of readdirSync(folder).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
      expect(read(f), f).not.toMatch(/^import (?!type )[^\n]*from '(three|@\/ui\/trois\/(scene3d|iso))'/m)
    }
  })

  it('the site presents npm install (the package is on npm since 0.2.1)', () => {
    expect(read('DocsTeaser.ts')).toContain('npm install mochiz-world three')
    for (const f of pages) expect(read(f), f).not.toMatch(/coming\s+soon|not on npm yet/i)
  })
})
