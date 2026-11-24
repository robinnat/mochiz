import { BotEngine } from '../src/bot/engine'
import { RADIUS } from '../src/bot/frame'
import { COLORS, SHAPES } from '../src/bot/skins'
import { Moods, type MoodId } from '../src/bot/moods'
import type { AccessorySelection } from '../src/bot/slots'
import type { Material } from '../src/ui/3d/material'
import type { Theme } from '../src/ui/3d/theme'
import { FUR } from '../src/ui/3d/fur'

/**
 * Dev page for the Plush style (not built): `?mode=sheet` (shapes in Plush, front and 3/4, and Soft / Plush side by
 * side), `?mode=anim` (one Plush Mochi, a frame at `window.drawAt(t)`), `?mode=bench&n=6` (real `<mochi-bot>`
 * elements, for the frame rate). Headless Chrome with the GPU captures it (see the Mochi project notes).
 */
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'sheet'
const PAPER = '#f9f9f9'
const hexOf = (id: string) => COLORS.find((c) => c.id === id)!.hex
const FRAME = 150

let renderAvatar: typeof import('../src/ui/3d/scene3d').renderAvatar
const engines = new Map<string, BotEngine>()
function engine(shape: string) {
  let e = engines.get(shape)
  if (!e) {
    e = new BotEngine(RADIUS, 'idle', SHAPES.find((s) => s.id === shape)!.radii, null)
    engines.set(shape, e)
  }
  return e
}

function tile(shape: string, color: string, style: Material, yaw: number, t = 0.6, size = 300, theme: Theme = 'light', sel: AccessorySelection = {}, mood: MoodId = 'idle'): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const h = new Moods(mood)
  const frame = engine(shape).sample(t, h.sample(t))
  renderAvatar(cv, frame, color, PAPER, style, shape, yaw, sel, FRAME, theme)
  return cv
}

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#26222f', bold = true, align: CanvasTextAlign = 'left') {
  c.font = `${bold ? 600 : 400} ${size}px system-ui, -apple-system, sans-serif`
  c.fillStyle = color
  c.textAlign = align
  c.fillText(s, x, y)
}

const SHEET_SHAPES: Array<[string, string]> = [
  ['circle', 'blue'], ['squircle', 'orange'], ['star', 'amber'], ['cloud', 'sky'],
  ['drop', 'pink'], ['egg', 'green'], ['flower', 'violet'], ['triangle', 'red']
]

async function sheet() {
  const CELL = 300
  const cols = SHEET_SHAPES.length / 2
  const W = cols * CELL * 2 + 80
  const H = 2 * (CELL + 40) + 120 + CELL + 120 + CELL + 110
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  c.fillStyle = '#fbfbf9'
  c.fillRect(0, 0, W, H)
  text(c, 'Plush: 8 shapes, front and 3/4', 40, 56, 30)
  SHEET_SHAPES.forEach(([shape, col], i) => {
    const x = 40 + (i % cols) * CELL * 2
    const y = 90 + Math.floor(i / cols) * (CELL + 40)
    const sel: AccessorySelection = i === 3 ? { head: 'beret' } : i === 6 ? { eyes: 'round' } : {}
    c.drawImage(tile(shape, hexOf(col), 'plush', 0, 0.6, CELL, 'light', sel), x, y)
    c.drawImage(tile(shape, hexOf(col), 'plush', 0.62, 0.6, CELL, 'light', sel), x + CELL, y)
    text(c, `${shape} · ${col}`, x + CELL, y + CELL + 22, 18, '#8a8794', false, 'center')
  })
  const y2 = 90 + 2 * (CELL + 40) + 40
  text(c, 'Same Mochi: Soft (left) and Plush (right), light and dark', 40, y2 - 10, 26)
  const pairs: Array<[Material, Theme]> = [['soft', 'light'], ['plush', 'light'], ['soft', 'dark'], ['plush', 'dark']]
  pairs.forEach(([s, th], i) => {
    const x = 40 + i * CELL * 1.1 + (i >= 2 ? 120 : 0)
    if (th === 'dark') {
      c.fillStyle = '#1b1922'
      c.fillRect(x, y2 + 10, CELL, CELL)
    }
    c.drawImage(tile('squircle', hexOf('turquoise'), s, 0.35, 0.6, CELL, th, { neck: 'bowtie' }), x, y2 + 10)
    text(c, `${s === 'soft' ? 'Soft' : 'Plush'} · ${th}`, x + CELL / 2, y2 + CELL + 34, 18, '#8a8794', false, 'center')
  })
  const y3 = y2 + CELL + 110
  text(c, 'Pile height (engine units; a Mochi is 200 wide): 4, 6 (current), 10', 40, y3 - 10, 26)
  const base = FUR.length
  ;[4, 6, 10].forEach((len, i) => {
    FUR.length = len
    const x = 40 + i * CELL * 1.1
    c.drawImage(tile('circle', hexOf('coral'), 'plush', 0.35, 0.6, CELL), x, y3 + 10)
    text(c, `${len}${len === base ? ' (current)' : ''}`, x + CELL / 2, y3 + CELL + 34, 18, '#8a8794', false, 'center')
  })
  FUR.length = base
  document.body.appendChild(cv)
  cv.id = 'out'
}

/** One Plush Mochi: idle, then the `done` mood (a happy hop), then a laugh. `drawAt(t)` renders the frame at t. */
function anim() {
  const S = Number(q.get('size') ?? 480)
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  cv.id = 'out'
  document.body.appendChild(cv)
  const c = cv.getContext('2d')!
  const shape = q.get('shape') ?? 'squircle'
  const color = hexOf(q.get('color') ?? 'orange')
  const off = document.createElement('canvas')
  off.width = off.height = S
  ;(window as unknown as { drawAt: (t: number) => void }).drawAt = (t: number) => {
    const h = new Moods('idle')
    if (t >= 2.4) h.setMood('done', 2.4)
    if (t >= 5.2) h.setMood('idle', 5.2)
    if (t >= 5.6) h.react('laugh', 5.6)
    // replay the events up to t (the engine is a pure function of time)
    const frame = engine(shape).sample(t, h.sample(t))
    const yaw = 0.25 * Math.sin(t * 0.8)
    renderAvatar(off, frame, color, PAPER, (q.get('style') ?? 'plush') as Material, shape, yaw, {}, 165, 'light')
    c.fillStyle = '#fbfbf9'
    c.fillRect(0, 0, S, S)
    c.drawImage(off, 0, 0)
  }
}

async function bench() {
  ;(window as unknown as { __mb: unknown }).__mb = await import('../src/components/mochi-bot')
  const n = Number(q.get('n') ?? 6)
  const size = Number(q.get('size') ?? 160)
  const style = q.get('style') ?? 'plush'
  const moods = ['idle', 'thinking', 'working', 'waiting', 'done', 'blocked', 'asleep']
  const shapes = ['squircle', 'star', 'circle', 'flower', 'triangle', 'hexagon', 'egg', 'cloud', 'drop', 'pebble', 'capsule']
  const colors = ['red', 'blue', 'amber', 'green', 'orange', 'violet', 'pink', 'turquoise']
  const accs = [{ head: 'cap' }, {}, { eyes: 'round', neck: 'bowtie' }, {}, { head: 'top-hat' }]
  const g = document.createElement('div')
  g.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:4px'
  document.body.appendChild(g)
  for (let i = 0; i < n; i++) {
    const b = document.createElement('mochi-bot') as HTMLElement & { accessories: unknown }
    b.setAttribute('size', String(size))
    b.setAttribute('render-style', style)
    b.setAttribute('shape', shapes[i % shapes.length]!)
    b.setAttribute('color', colors[i % colors.length]!)
    b.setAttribute('mood', moods[i % moods.length]!)
    if (q.get('acc') !== '0') b.accessories = accs[i % accs.length]
    b.setAttribute('theme', 'light')
    g.appendChild(b)
  }
}

;(async () => {
  ;({ renderAvatar } = await import('../src/ui/3d/scene3d'))
  if (mode === 'single') {
    // one Mochi on a transparent canvas: ?shape=&color=&style=&yaw=&theme=&size=&t=
    const cv = tile(q.get('shape') ?? 'capsule', hexOf(q.get('color') ?? 'red'), (q.get('style') ?? 'plush') as Material, Number(q.get('yaw') ?? 0), Number(q.get('t') ?? 0.6), Number(q.get('size') ?? 520), (q.get('theme') ?? 'dark') as Theme)
    cv.id = 'out'
    document.body.style.background = q.get('bg') ?? ((q.get('theme') ?? 'dark') === 'dark' ? '#121212' : '#fbfbf9')
    document.body.appendChild(cv)
  } else if (mode === 'sheet') await sheet()
  else if (mode === 'anim') anim()
  else await bench()
  document.body.dataset.done = '1'
})()
