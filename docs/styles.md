# Styles

Mochiz offers four styles, all in REAL 3D (Three.js, loaded on demand, one shared WebGL context):

| Style | `render-style` id | How it is drawn |
| --- | --- | --- |
| **Soft** (default) | `3d` | soft material: smooth shading, a soft light from the top left and glows, computed in the shader, in camera space; no shine spot |
| **Flat** | `flat3d` | `toon`: three clean tones |
| **Pixel** | `pixel3d` | rendered at low resolution (the `pixel` grid), reduced to a short palette (3 body tones, accessory tones, white eyes), a built-in 1 px outline (part of the Pixel look, not an option), scaled up with `image-rendering: pixelated` (`src/ui/3d/pixel3d.ts`) |
| **Plush** | `plush` | the Soft body in a coat of long, dense fur, with dark bead eyes pressed into it (`src/ui/3d/fur.ts`, `furCoat.ts`); see [Plush](#plush-a-coat-of-fur) below |

**No 2D.** The old SVG drawings are gone from the code: no 2D fallback, no 2D export. An unknown `render-style` value falls back to the current setting. Without WebGL, a short message replaces the Mochi (`no3d` event). The still images of the website (`public/renders/`) are made from the 3D too, with `tools/renders.html`.

**Eyes.** In the light theme the eyes are ALWAYS white, for every color (yellow `#ffd60a` and lime `#b6e800` included), with no outline: only the normal 3D shading of the eye remains. In the dark theme they are black. Plush is the one exception: its eyes are dark glossy beads in both themes, like the eyes of a soft toy.

## Shading all around (`src/ui/3d/rim.ts`)

Shading is NOT painted in the face texture (that used to darken the back and sides and left a seam). Everything is computed in the shader, in camera space, on the whole volume: soft occlusion towards the bottom and the edges, a glow at the bottom right (4 o'clock), a light glow at the top left (10 o'clock), and a soft light from the top left: the side facing it gets lighter, in a long gradient. That light is what gives the Soft style its volume. It has no edge, so there is no shine spot (the small spot and the `highlight` option were removed in 0.2.0; the volume stays). The texture only holds the color and the eyes.

The Soft style is always shaded: without its relief it would look exactly like Flat without shading, so it ignores `shading="false"`. Plush, built on the Soft body, ignores it too.

`shading="false"` works on Flat and Pixel: the body is one flat color, the eyes do not change.

**Ground shadow.** Every style draws a shadow on the ground under the body (`shadow`, on by default, `shadow="false"` turns it off): a soft gradient in Soft and Plush, a flat semi-transparent ellipse in Flat, and an ellipse made of whole pixels with hard edges in Pixel (a darker core and a lighter rim).

## Plush: a coat of fur

Plush dresses the Soft body in a coat of fur. The technique is the "fluffy" material of [open-bot-avatar](https://github.com/DominikScholz/open-bot-avatar) by Dominik Scholz (MIT License), ported to the Mochiz scene. Its copyright line is in [LICENSE](../LICENSE) and in the notice at the top of the built files.

- **One program, three layers** (`src/ui/3d/furCoat.ts`): the body surface with the eyes seated in it as glossy beads, a few shells of pile lifted off that surface, and tens of thousands of single strands over the whole body. All three read the same pile, stored in model space, so the coat holds together when the Mochi turns.
- **The coat follows the body.** A Mochi changes shape every frame (breathing, squash, change of shape). The strands are rooted on the triangles of the body mesh and read their corners from a texture of the frame's vertices on the graphics card, so moving them costs the processor only that upload.
- **Eye sockets** (`furSocket.ts`): around each eye the coat is pressed down. The socket follows the eye through blinks, smiles and moods, from a small distance field rebuilt when the eyes change.
- **Color** (`furDye.ts`): each body color becomes a ramp from the darkest recess to the brightest tip, so every color keeps its hue through the shading.
- **Detail follows size and load** (`fur.ts`): a small Mochi draws fewer shells and part of its strands, each one wider, so the coat covers the same. When drawing all the Mochiz of the page costs more than 7 ms per frame, the coats get lighter (about 60 %, then about a third of the full coat), before the frame rate has to halve. A still image (`frozen-at`) always gets the full coat.

**Cost.** Plush asks about twice as much of the graphics card as Soft. It is best with a few Mochiz on screen (an avatar, a mascot, a hero image). For a page with many animated Mochiz, or for older phones, prefer Soft, Flat or Pixel. Accessories, the ground shadow, moods and reactions work as in Soft.

## 3D shapes

The 12 shapes have a real volume from every angle: a sphere (circle), an ellipsoid (pebble), a very round pillow (squircle), a lying tube (capsule), a rounded cone (triangle), a deep hexagon, cloud, drop, star, flower, egg and heart.

- Star, hexagon, cloud and flower are inflated as a "cushion" (`ProfileVolume.cushion`): the height solves a Poisson equation inside the outline (0 on the edge), computed once per shape and cached, then `z = H * (u / umax) ^ 0.45`. The surface is smooth everywhere, with a rounded edge and no fold between lobes; normals are smoothed on top.
- Drop, egg, triangle and capsule are solids of revolution (`ProfileVolume.revolution`): the depth of a point is the half width of the outline at its height.

The engine does not change: `engine.sample(t)` gives the same frame, and the states, their measurements and durations are the same. Only `mochi-bot.ts` paints the frame differently. The catalog and the current setting live in `src/ui/renderStyle.ts`.

## How the 3D works

- **The body is the outline, inflated** (`volume.ts`, pure and tested under Node): the `bodyPath` of the frame becomes points, then each ray from the center to the edge becomes a series of rings.
- **The eyes are on the front face only.** On a shape with a flat front, the pair of eyes is shifted (same vector, same gap) so it never bites into the rounded edge.
- **The eyes are painted in a texture** projected from the front, at the exact positions given by the engine, and ALSO in an emission texture (white on black): an eye is a light hole, the lighting must not gray it.
- **One WebGL context** for every avatar of the page (`renderAvatar`): each one asks for a frame, which is rendered and copied into its own canvas. Each `<mochi-bot>` has its own 3D body (`avatarSlot`): its meshes, its face texture (sized to the render, 512 px at most) and its accessories stay from one frame to the next. The outline and the face are rebuilt only when they changed.
- **Off screen, nothing is drawn**: an `IntersectionObserver` pauses the drawing of a Mochi out of view; its clock keeps going.
- **Adaptive cadence**: the drawing time of every Mochi is added up each frame. When frames come late (more than 20 ms apart) and drawing all of them costs more than 8 ms, each Mochi draws every other frame, half on even frames and half on odd ones (30 per second each); back to every frame below 6 ms. A computer that keeps up never halves (`cadenceFrame` in `mochi-bot.ts`).
- **Three.js enters through `src/ui/3d/three.ts`** only: each class is imported from its own source file, so the bundle keeps only what Mochiz draws with.
- **Loaded on demand**: `scene3d.ts` is never imported statically (about 133 kB gzip). `mochi-bot.ts` loads it when it mounts; until then the Mochi is not drawn (the `ready` event fires on the first frame).

## Materials

The material of the Soft style is `soft`. It has no setting: its darkest tone is 0.56 in linear light, about 24 % darker on screen. (The `softness` option was removed in 0.2.0: its lighter setting barely showed.)

The shadow is a smooth, matte ramp of `dot(normal, light)`, with the light at the top left, in front. On top of it, the soft top-left light adds volume; there is no shine spot on the body.

Flat uses the `toon` material and Pixel the `pixel` material: the render style picks the material, there is no option for it. Other materials stay in the code but are not offered: `flat` (two tones only, judged too heavy), `toon-outline`, `lowpoly` and `realistic` (internal only). There is no cartoon outline option (removed in 0.2.0); the thin outline of the Pixel style is part of its drawing.

Screenshots (taken before Plush): [Soft, Flat and Flat without shading](variants/3d-styles-sheet.png), [every shape in each style](variants/3d-shapes-sheet.png) and [every shape seen from four angles](variants/3d-turntable.png).

## Known limits

- Cost per frame: measured in a browser without a GPU (a worst case) for three animated 3D Mochiz, 2.7 ms of JavaScript update and about 21 ms of software rendering. On a real GPU the rendering is negligible, except for Plush (about twice the cost of Soft, see above). Still images (`frozen-at`) render only once.
- `<foreignObject>` in Safari on iPhone is not tested yet.
- 3D GIFs are heavy (about 800 kB for 3 s): gradients make many colors, and a GIF keeps 256.
