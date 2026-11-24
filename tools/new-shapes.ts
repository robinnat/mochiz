import { BotEngine } from '../src/bot/engine'
import { RADIUS } from '../src/bot/frame'
import { COLORS, NEW_SHAPES, SHAPE_BY_ID } from '../src/bot/skins'
import { Moods, type MoodId } from '../src/bot/moods'
import type { Material } from '../src/ui/3d/material'

/**
 * Sheet of the new shapes under review (24/11/2026): each one in Soft, front and 3/4, then in Flat and Pixel, then in
 * a happy mood. `?shapes=cat,bear` limits the list. Captured with headless Chrome and the GPU.
 */
const q = new URLSearchParams(location.search)
const PAPER = '#f9f9f9'
const hexOf = (id: string) => COLORS.find((c) => c.id === id)!.hex
const PALETTE = ['orange', 'sky', 'violet', 'pink', 'apple', 'amber', 'coral', 'blue', 'red', 'turquoise']
const list = q.get('shapes') ? q.get('shapes')!.split(',') : NEW_SHAPES.map((s) => s.id)

let renderAvatar: typeof import('../src/ui/3d/scene3d').renderAvatar

function tile(shape: string, color: string, style: Material, yaw: number, size: number, mood: MoodId = 'idle', t = 0.6) {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const h = new Moods(mood)
  const frame = new BotEngine(RADIUS, 'idle', SHAPE_BY_ID.get(shape)!.radii, null).sample(t, h.sample(t))
  renderAvatar(cv, frame, color, PAPER, style, shape, yaw, {}, 160, 'light')
  return cv
}

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#26222f', bold = true) {
  c.font = `${bold ? 600 : 400} ${size}px system-ui, -apple-system, sans-serif`
  c.fillStyle = color
  c.textAlign = 'center'
  c.fillText(s, x, y)
}

;(async () => {
  ;({ renderAvatar } = await import('../src/ui/3d/scene3d'))
  const BIG = 260
  const SMALL = 130
  const COLW = BIG * 2 + 30
  const cols = 5
  const rows = Math.ceil(list.length / cols)
  const ROWH = BIG + SMALL + 70
  const cv = document.createElement('canvas')
  cv.width = cols * COLW + 40
  cv.height = rows * ROWH + 90
  const c = cv.getContext('2d')!
  c.fillStyle = '#fbfbf9'
  c.fillRect(0, 0, cv.width, cv.height)
  c.font = '600 30px system-ui, -apple-system, sans-serif'
  c.fillStyle = '#26222f'
  c.textAlign = 'left'
  c.fillText('New shapes (for review): Soft front and 3/4; below: Flat, Pixel, happy', 30, 52)
  list.forEach((shape, i) => {
    const x = 20 + (i % cols) * COLW
    const y = 80 + Math.floor(i / cols) * ROWH
    const color = hexOf(PALETTE[i % PALETTE.length]!)
    c.drawImage(tile(shape, color, 'soft', 0, BIG), x, y)
    c.drawImage(tile(shape, color, 'soft', 0.62, BIG), x + BIG, y)
    c.drawImage(tile(shape, color, 'toon', 0.3, SMALL), x + 40, y + BIG)
    c.drawImage(tile(shape, color, 'pixel', 0.3, SMALL), x + 40 + SMALL, y + BIG)
    c.drawImage(tile(shape, color, 'soft', 0.2, SMALL, 'done', 0.9), x + 40 + 2 * SMALL, y + BIG)
    text(c, shape, x + BIG, y + BIG + SMALL + 30, 22)
  })
  cv.id = 'out'
  document.body.appendChild(cv)
  document.body.dataset.done = '1'
})()
