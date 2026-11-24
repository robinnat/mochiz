import { h, render } from '../src/ui/dom/h'
import 'mochiz-world'

// Four still Mochiz, one per style, on the right of the share image: the blue circle of the logo in Soft, and
// three of the shapes added in 0.3 (cat in Plush, ghost in Pixel, rice ball in Flat). Colors from the P1 palette.
const PAPER = '#fbfbf9'
const SIZE = 320
const CELLS = [
  { x: 535, y: -18, label: 'Soft', shape: 'circle', color: '#2d5bff', style: '3d', yaw: 0 },
  { x: 835, y: -18, label: 'Plush', shape: 'cat', color: '#ff9500', style: 'plush', yaw: -0.25 },
  { x: 535, y: 280, label: 'Pixel', shape: 'ghost', color: '#00c46a', style: 'pixel3d', yaw: 0.25 },
  { x: 835, y: 280, label: 'Flat', shape: 'riceball', color: '#ff4d94', style: 'flat3d', yaw: 0 }
]

let painted = 0
const done = () => {
  if (++painted === CELLS.length) void document.fonts.ready.then(() => (document.body.dataset.done = '1'))
}

render(
  h(
    'div',
    { style: 'display: contents' },
    CELLS.map((c) =>
      h('div', { class: 'cell', style: `left:${c.x}px; top:${c.y}px` }, [
        h('mochi-bot', {
          size: SIZE,
          shape: c.shape,
          color: c.color,
          renderStyle: c.style,
          yaw: c.yaw,
          theme: 'light',
          paper: PAPER,
          interactions: false,
          frozenAt: 0,
          label: '',
          onReady: done
        }),
        h('span', {}, [c.label])
      ])
    )
  ),
  document.getElementById('og')!
)
