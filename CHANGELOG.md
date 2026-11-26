# Changelog

Every change that matters to you, version by version, the newest at the top.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

To install the latest version: `npm install mochiz-world three` (see [Getting started](docs/getting-started.md#install)).

## [Unreleased]

### Added

- **A Changelog page in the docs** (https://mochiz.vercel.app/docs?page=changelog). It shows this file, exactly as it
  is in the repository.
- Docs: Getting started explains how to move the CDN link to a newer version.

### Fixed

- Docs: the reference no longer says that Plush eyes are dark in both themes. Since 0.3.1 they follow the theme, like
  every style.
- Docs: the styles page no longer links to three old screenshots, made before Plush and the 22 shapes. The website
  shows every shape in every style instead.
- `SECURITY.md`: the supported version is the latest npm release, 0.3.x (it still said 0.2.x).

## [0.3.1] - 2026-11-26

### Fixed

- **Plush eyes now follow the theme**, like the eyes of every other style: white bead eyes in the light theme, black
  bead eyes in the dark theme. In 0.3.0 they were dark in both themes.
- The beads keep their look: pressed into the fur, with a small shine. There is no dark line around a bead: the sunk
  look comes from a soft shadow of the fur around it, in the fur's own color.
- On the default color (`ink`), Plush eyes now show in the light theme. In the dark theme, a very dark body is
  lightened just enough for the black beads to show, as in the other styles.

## [0.3.0] - 2026-11-25

### Added (Plush)

- **A fourth style, Plush** (`render-style="plush"`): the Soft body in a coat of long, dense fur, with dark glossy bead
  eyes pressed into it, in both themes (since 0.3.1, the eyes follow the theme). The technique is the "fluffy"
  material of open-bot-avatar (https://github.com/DominikScholz/open-bot-avatar), Copyright (c) 2026 Dominik Scholz,
  MIT License, ported to the Mochiz scene; its copyright line is added to LICENSE and to the notice of the built
  files. Plush asks about twice as much of the graphics card as Soft: best with a few Mochiz on screen. The coat gets
  lighter by itself when the page has many Mochiz to draw. `RENDER_STYLES` (entry `mochiz-world/catalog`) now lists
  four styles.
- The website shows Plush in the styles section, the shapes grid and the customizer.

### Added (shapes)

- **Ten new shapes**, for 22 in all: `cat`, `bear`, `ghost`, `daifuku`, `pear`, `bean`, `riceball`, `gem`, `mushroom`
  and `bell`. They work like the others: real 3D volume, every style, mood, reaction and accessory, eyes always
  inside the silhouette. `SHAPES` (entry `mochiz-world/catalog`) lists them after the first twelve, which keep their
  order. The website shows them in the shapes grid and the customizer.

### Changed

- Each version on npm is now published from its GitHub release, by a GitHub Action, with provenance: the npm page
  of the package shows which commit and which workflow built it.

## [0.2.1] - 2026-11-11

### Added

- **Published on npm as `mochiz-world`**: `npm install mochiz-world three`, then `import 'mochiz-world'`. npm refuses
  the name `mochiz` (too close to the `mocha` package), so the package is `mochiz-world` (entries `mochiz-world`,
  `mochiz-world/catalog`, `mochiz-world/standalone`). The project, the `<mochi-bot>` tag and the built file names
  (`dist-lib/mochiz.js`) do not change. The docs (Getting started, README) now install from npm, and give a CDN
  script tag for plain HTML (`https://cdn.jsdelivr.net/npm/mochiz-world@0.2.1/dist-lib/standalone/mochiz.js`,
  Three.js included). Building the library from the repository is still described.
- `publishConfig` (public access) and `prepublishOnly` (tests, then the library build) in package.json.

### Fixed

- `/app/`, `/lab/` and `/labo/` (with a final slash) redirect to the home page like `/app`, `/lab` and `/labo`; they
  gave a 404.
- The favicon, the app icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) and the logo of the menu were
  made before the shine spot of the Soft style was removed: they are rendered again from the current Soft style.
- The Pixel images of the home page (`public/renders/*pixel3d*`) are rendered again with the centered ground shadow.
- This changelog: the 0.2.0 line about `sideEffects` listed two files; it lists the four entries.
- `SECURITY.md`: the supported version is the latest npm release.
- The built files of the library carry the MIT notice again (`/*! Mochiz ... */` at the top of each file, plus the
  Three.js notice in the standalone build): minification had removed it, while the docs ask you to ship it.

## [0.2.0] - 2026-11-11

**First public release**, on GitHub (on npm from 0.2.1). The project was called Mochis, then Mochiz, during the work
on this version; this entry uses the names of the release.

There was no public version before, so nobody has to migrate. The tables below are for readers of the development
versions, and for pages written with old ids.

### Added

- **One HTML tag, `<mochi-bot>`**: a native web component with no framework. It works in plain HTML, React, Vue,
  Svelte, Angular or any other framework. Every option is an attribute (text, with dashes; JSON for `accessories`
  and `cycle`) and a property (camelCase, any value).
- **Real 3D only** (Three.js, loaded on demand, one WebGL context shared by every Mochi of the page), in three styles:
  Soft (`3d`, the default), Flat (`flat3d`) and Pixel (`pixel3d`, with `pixel` set to `medium` or `fine`).
- Every style draws a **ground shadow** (`shadow`, on by default). In Pixel it is made of whole pixels with hard edges.
  `shading="false"` gives one flat color in Flat and Pixel; Soft is always shaded. `yaw` turns the model.
- **12 shapes** (`circle`, `pebble`, `squircle`, `capsule`, `triangle`, `hexagon`, `cloud`, `drop`, `star`, `flower`,
  `egg`, `heart`) with a real volume from every angle, and **18 colors**, or any hex color.
- **7 moods** (`idle`, `thinking`, `working`, `waiting`, `done`, `blocked`, `asleep`; `sleep` and `sleeping` also
  work) and **5 reactions** (`startle`, `laugh`, `blush`, `dizzy`, `wave`). With `interactions` on (the default), a
  Mochi reacts to hover, tap, double tap, long press and shake. `wave` greets once on arrival. `laptop="false"` hides
  the laptop of `working`. Everything respects `prefers-reduced-motion`.
- **22 accessories** in four slots (`head`, `eyes`, `neck`, `back`), one per slot, in their catalog colors or your
  own (`c1`, `c2`). Glasses and the monocle are in `eyes`.
- **Light and dark themes.** Without `theme`, a Mochi follows the device (`currentTheme` is `auto`). The eyes are white
  in the light theme, for every color, and black in the dark theme, with no outline. In the dark theme, a body too
  dark for black eyes is lightened just enough.
- Methods `setMood`, `react`, `release`, `lookAt`, `seek` and `renderAt`; events `ready`, `no3d`, `statechange`,
  `blockchange`, `playingchange` and `elapsedchange` (standard `CustomEvent`s). Without WebGL, a short message takes the
  Mochi's place and the element fires `no3d`.
- Options `frozen-at` (one still frame), `fps`, `max-pixel-ratio`, `follow`, `label` (English by default), and the
  advanced `expression`, `cycle` and `paper`.
- **Speed.** Each Mochi keeps its own 3D body (meshes, face, accessories): 6 Mochiz with accessories went from 4 to 60
  frames per second on a Mac. A Mochi off the screen draws nothing, and its clock keeps going. When drawing every
  Mochi gets too heavy, each one draws every other frame (30 per second, steady); a Mochi with its own `fps` keeps it.
  Removed from the page, a Mochi stops its loop, listeners and timers.
- **The library** (`pnpm build:lib`, in `dist-lib/`): entries `mochiz` (the tag, the engine and the catalogs) and
  `mochiz/catalog` (the catalogs alone, to build a picker), with TypeScript types. Three.js is a peer dependency
  (`three` `^0.187.0`): your bundler keeps one copy, and only the classes Mochiz draws with. The standalone build
  (`dist-lib/standalone/`) includes Three.js, for plain HTML. `sideEffects` names the files that declare the tag
  (`dist-lib/mochiz.js`, `dist-lib/standalone/mochiz.js`), the sources (`./src/**`) and CSS files.
- **One documentation.** The website's `/docs` page is built from `README.md` and `docs/*.md`, with live examples
  taken from their code blocks. A test fails if the site and the repository say different things, or if the docs and
  the code disagree.
- The website https://mochiz.vercel.app: a home page and `/docs`.
- Community files (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull request templates) and
  French versions of the README and of these files.

### Changed (renamed ids)

Everything is in English. There are no aliases for the old ids, except the pixel sizes.

| Before | Now |
| --- | --- |
| entries `mochi-world`, `mochi-world/catalogue` | `mochiz`, `mochiz/catalog` (`mochiz-world` on npm, since 0.2.1) |
| shapes `cercle`, `galet`, `hexagone`, `nuage`, `goutte`, `etoile`, `fleur`, `oeuf`, `coeur` | `circle`, `pebble`, `hexagon`, `cloud`, `drop`, `star`, `flower`, `egg`, `heart` |
| colors `encre`, `brun`, `rouge`, `corail`, `ambre`, `citron`, `pomme`, `vert`, `ciel`, `bleu`, `rose`, `cerise`, `gris`, `creme` | `ink`, `brown`, `red`, `coral`, `amber`, `lime`, `apple`, `green`, `sky`, `blue`, `pink`, `cherry`, `gray`, `cream` |
| moods `repos`, `reflechit`, `travaille`, `attend`, `termine`, `bloque`, `dort` | `idle`, `thinking`, `working`, `waiting`, `done`, `blocked`, `asleep` |
| reactions `sursaut`, `rigole`, `rougit`, `etourdi`, `coucou` | `startle`, `laugh`, `blush`, `dizzy`, `wave` |
| slots `tete`, `yeux`, `bas`, `dos` | `head`, `eyes`, `neck`, `back` |
| attributes `rendu`, `ombre`, `ombrage`, `accessoires`, `coucou`, `ordinateur` | `render-style`, `shadow`, `shading`, `accessories`, `wave`, `laptop` |
| events `pret`, `sans3d` | `ready`, `no3d` |
| methods `rendAt`, `relacher`, `regarder` | `renderAt`, `release`, `lookAt` |
| pixel sizes `moyen`, `fin` (and `gros`) | `medium`, `fine` (`gros` becomes `medium`) |

### Removed

- **No 2D any more**: the SVG drawings (`original`, `pixel`, `argile`, `bubble`) are gone. Every Mochi is drawn in 3D.
- **No framework any more**: the Vue component is replaced by the `<mochi-bot>` tag.
- Options that are gone: `outline` and `outline-width` (cartoon outline), `highlight` (the shine spot of Soft; Soft
  keeps its soft light from the top left), `softness`, `material` (the style picks the material) and `worn`. An old
  attribute on a page is simply ignored. The thin outline of the Pixel style stays: it is part of the Pixel drawing.
- The `large` pixel size: an old `pixel="large"` becomes `medium`.
- On the website: the `/app` editor (with its exports) and the `/lab` page. `/app`, `/lab` and `/labo` redirect to
  the home page.

## 0.1.1 - 2026-08-17

Before the public repository: a version of the animation editor (removed in 0.2.0). It has no GitHub release. First
batch of post-launch fixes. Every entry was reproduced and measured before being fixed, and the measurement is in the
commit that fixes it.

### Fixed

- **Playback could never get past a repeated animation.** Writing `#state=` fired a `hashchange` the listener read as
  an incoming navigation, and the lookup returns a state's *first* occurrence, so a montage holding the same animation
  twice looped forever on the first one. One click in the palette was enough to trigger it.
- **Three image defects in the montage export**, none visible short of stepping through an MP4 frame by frame: one
  corrupt frame at every block joint (the eye trajectory jumped up to 53.4 units, now 0.6 max), the GIF opening on an
  eyeless ball, and a montage not starting on the resting animation fading in from it anyway.
- **The eyes left the silhouette on non-circular shapes.** The eye is placed by a pro-rata of the local body radius,
  which divides its margin at the edge by the same factor, so the capsule, triangle, cloud and teardrop pushed it
  through the mask. Five state and shape pairs let an eye out of the body, up to 14.5 units on a ball of radius 100;
  now none do.
- **A failed montage export said nothing.** The failure went to a component only rendered in another view, so the
  progress bar vanished and nothing explained why.
- **MP4 stayed selected on browsers that cannot encode it.** The option was hidden but the value still won, and the
  export failed on the spot.
- **`toMp4` leaked its encoder on failure.** Chrome caps simultaneous hardware encoders, so after a few failures later
  exports died at startup for an unrelated reason.
- **A forbidden `localStorage` made the page blank.** Reading the property throws a `SecurityError` when access is
  denied (blocked cookies, third-party iframe, enterprise policy), and that propagated out of setup. Persistence is
  now optional; the application never is.
- **A hand-edited montage could freeze the tab.** 4.65 MB of JSON, inside the storage budget, produced 1.5 million
  tick objects and a track 29 700 000 px wide.
- **A state change landing inside a fade jumped.** The blend restarted from the full pose of the state being left
  instead of the frame actually on screen: 26 to 43 px against the 10 to 14 px a spaced change produces.
- **Modals still slid under `prefers-reduced-motion`**, and the setting was read once at startup rather than followed.
- **Three popups declared `role="menu"` without the keyboard contract it promises**, so the Tab order did not match
  what was announced.
- **The Settings and Animations views were unusable below 64rem**: the navigation rail floated over the content, the
  montage bar had no background, and the wordmark covered the credits. Below 64rem the navigation rail is now a
  horizontal bar at the top, and the wordmark sits at the foot of the page.
- **The montage bar took 29 % of a phone screen** and its toolbar overflowed a 327 px row. It is 200 px below 64rem:
  still the ruler plus a card at full thumbnail size.

### Added

- **Continuous integration.** There was none, so a pull request checked nothing.
- **Cancelling a montage export.** Escape used to close the box while the export ran to completion and downloaded a
  file nobody was waiting for.
- **Reordering a block by keyboard** (`Alt` + arrows), the one editing gesture that had no keyboard route, plus arrow
  keys to move the playhead.
- **33 tests** (178 to 211), including the first that mounts the component to check the off-screen render: the export
  defects above were invisible to everything else.

### Changed

- `RADIUS` and `HALF_VIEWBOX` moved to `src/bot/frame.ts`. They define what the engine returns, so they could not stay
  in a `<script setup>` that exports nothing.
- `MIN_BLOCK` is derived from the longest fade in the catalogue instead of written by hand: it only worked because the
  two happened to match.

### Removed

- `StateDef.hint`: 15 hardcoded French strings nothing read, inside a type meant to become public.

[unreleased]: https://github.com/robinnat/mochiz/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/robinnat/mochiz/releases/tag/v0.3.1
[0.3.0]: https://github.com/robinnat/mochiz/releases/tag/v0.3.0
[0.2.1]: https://github.com/robinnat/mochiz/releases/tag/v0.2.1
[0.2.0]: https://github.com/robinnat/mochiz/releases/tag/v0.2.0
