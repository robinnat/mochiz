/**
 * The Plush coat in Three.js: shells of pile over the body, and fringe strands. The settings, the root picking and the
 * comb direction are pure, in `fur.ts`; this file only builds the meshes and the shaders.
 *
 * - Undercoat (shell 0): the body again, a hair above it, fully covered with the pile color: the body under it is
 *   only seen through the eyes.
 * - Shells 1..n: the body pushed out along the normals and combed down; a point is kept when the lock under it reaches
 *   that height. The locks are a 3D noise anchored on the body, smeared along the comb, so they look brushed.
 * - Strands: thin tapered ribbons, a few thousand, rooted by area on the surface and re-read from every frame. Long
 *   on the silhouette (the fuzzy outline of a plush toy), short on the face.
 * - Eyes: they are painted in the body texture as before. The coat leaves them free (the sharp eye mask) and presses
 *   its pile around them (a blurred copy of that mask, `paintSocket`): a soft socket with a crease.
 *
 * Lighting matches the Soft style (same key light at the top left, same soft ramp, same occlusion and glows, in camera
 * space), plus what fur adds: darker roots, lighter tips, and light caught by the fibers along the silhouette.
 * The pile color is read from the body texture, so the cheeks and the soft shadows of the accessories show through.
 *
 * This module is loaded with `scene3d.ts`, never statically.
 */

import {
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  Data3DTexture,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  type Texture,
  UnsignedByteType
} from './three'
import { COMB_GLSL, FUR, furDetail, NOISE_SIDE, noiseVolume, pickRoots, placeRoots, type FurDetail, type RootPick } from './fur'
import { SOFT_LIGHT_FROM, SOFT_LIGHT_GAIN } from './rim'

/** Key light of the avatar (same as `KEY_AVATAR` in `scene3d.ts`), normalized, camera space. */
const KEY = (() => {
  const k = [-1.1, 1.5, 1.6]
  const l = Math.hypot(k[0]!, k[1]!, k[2]!)
  return k.map((v) => (v / l).toFixed(4)).join(', ')
})()

/** Side of the blurred eye mask (the socket map): small on purpose, the GPU's linear filtering does the blur. */
export const SOCKET_SIDE = 64

const f = (n: number) => n.toFixed(3)

/** Lighting shared by the shells and the strands. `L` = height in the pile (0 root, 1 tip), `b` = socket map. */
const SHADE_GLSL = /* glsl */ `
vec3 furShade(vec3 n, vec3 dye, float L, float h, float b) {
  float d = dot(n, normalize(vec3(${KEY})));
  // the Soft ramp: 0.56 in the shadow, 1 in the light (ambient + key light of the soft material)
  float tone = 0.56 + 0.44 * smoothstep(-0.75, 0.7, d);
  float edge = 1.0 - clamp(n.z, 0.0, 1.0);
  float bottom = smoothstep(0.05, 0.95, -n.y);
  tone *= 1.0 - (0.26 * bottom + 0.16 * pow(edge, 1.4));
  // in the pile: darker roots, lighter crests
  float depth = mix(0.8, 1.0, pow(L, 0.7)) * (0.95 + 0.1 * h);
  // around an eye: the pile is pressed down, a soft crease
  depth *= 1.0 - 0.3 * smoothstep(0.04, 0.5, b) * (1.0 - 0.6 * L);
  vec3 col = dye * tone * depth;
  vec3 tint = mix(dye, vec3(1.0), 0.42) * 1.15;
  // light caught by the fibers along the silhouette: strongest towards 4 o'clock, like the Soft glow
  vec2 dir = normalize(n.xy + vec2(1e-4));
  float sect = smoothstep(-0.1, 0.85, dot(dir, normalize(vec2(0.72, -0.69))));
  float sectTop = smoothstep(0.05, 0.9, dot(dir, normalize(vec2(-0.71, 0.70))));
  float velvet = pow(edge, 2.0) * (0.3 + 0.7 * L);
  col += tint * velvet * (0.5 * sect + 0.28 * sectTop + 0.1);
  // the soft top-left light of the Soft style (volume, no spot)
  float hl = smoothstep(${f(SOFT_LIGHT_FROM)}, 1.0, dot(n, normalize(vec3(-0.5, 0.62, 0.6))));
  col += tint * hl * ${f(SOFT_LIGHT_GAIN)} * (0.55 + 0.45 * L);
  return col;
}`

const SHELL_VERTEX = /* glsl */ `
attribute float aLayer;
uniform float uLen;
varying float vLayer;
varying vec3 vObj;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vComb;
${COMB_GLSL}
void main() {
  vec3 n = normalize(normal);
  vec3 comb = furComb(position, n);
  float L = aLayer;
  vLayer = L;
  // up along the normal, then bent along the comb (more and more towards the tips)
  vec3 p = position + n * (0.15 + uLen * 0.85 * L) + comb * (uLen * 0.8 * L * L);
  vObj = position;
  vComb = comb;
  vUv = uv;
  vN = normalize(normalMatrix * normalize(n + 0.3 * L * comb));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const SHELL_FRAGMENT = /* glsl */ `
uniform highp sampler3D uNoise;
uniform sampler2D uMap;
uniform sampler2D uEyes;
uniform sampler2D uSocket;
uniform float uGrain;
varying float vLayer;
uniform float uOpacity;
varying vec3 vObj;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vComb;
${SHADE_GLSL}
// height of the pile here (0..1): locks smeared along the comb, and a finer fiber grain
float furHeight(vec3 p, vec3 comb) {
  vec3 q = p / 150.0;
  vec3 st = comb * (2.6 / 150.0);
  float lock = 4.0 * texture(uNoise, q).r;
  for (int i = 1; i <= 3; i++) {
    float w = 4.0 - float(i);
    lock += w * (texture(uNoise, q + float(i) * st).r + texture(uNoise, q - float(i) * st).r);
  }
  lock = clamp(0.5 + 2.0 * (lock / 16.0 - 0.5), 0.0, 1.0);
  vec3 g = p / 48.0;
  vec3 gs = comb * (1.2 / 48.0);
  float grain = 0.5 * (texture(uNoise, g + gs).r + texture(uNoise, g - gs).r);
  grain = clamp(0.5 + 1.2 * (grain - 0.5), 0.0, 1.0);
  return mix(lock, 0.75 * lock + 0.25 * grain, uGrain);
}
void main() {
  // the eye itself: no pile, the painted eye of the body shows
  if (texture(uEyes, vUv).r > 0.5) discard;
  float b = texture(uSocket, vUv).r;
  float L = vLayer;
  float h = furHeight(vObj, vComb);
  if (L > 0.0) {
    // around the eyes the pile is short
    float loft = 1.0 - 0.9 * smoothstep(0.04, 0.42, b);
    float hh = h * loft;
    float need = 0.12 + 0.84 * L;
    if (hh < need) discard;
  }
  vec3 dye = texture(uMap, vUv).rgb;
  gl_FragColor = vec4(furShade(normalize(vN), dye, L, h, b), uOpacity);
  #include <colorspace_fragment>
}`

const STRAND_VERTEX = /* glsl */ `
attribute vec3 aRoot;
attribute vec3 aNormal;
attribute vec2 aUv;
attribute vec2 aSeed;
uniform float uLen;
uniform float uWidth;
uniform vec2 uLenRange;
uniform sampler2D uSocket;
varying vec3 vN;
varying float vT;
varying vec2 vUv;
varying float vSeed;
${COMB_GLSL}
void main() {
  float t = position.x;
  float side = position.y;
  vec3 n = normalize(aNormal);
  vec3 comb = furComb(aRoot, n);
  vec3 tang = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 bit = cross(n, tang);
  float a = 6.2832 * aSeed.x;
  vec3 jitter = 0.4 * (tang * cos(a) + bit * sin(a));
  // near the eyes: no strand
  float fade = 1.0 - smoothstep(0.03, 0.22, textureLod(uSocket, aUv, 0.0).r);
  // long on the silhouette, short on the face (they stay inside the pile there)
  vec3 nv = normalize(normalMatrix * n);
  float rim = 1.0 - abs(nv.z);
  float len = uLen * mix(uLenRange.x, uLenRange.y, aSeed.y) * fade * smoothstep(0.3, 0.8, rim);
  vec3 dir = normalize(n * (0.65 - 0.4 * t) + (comb + jitter) * (0.7 + 0.4 * t));
  vec3 p = aRoot + n * (uLen * 0.25) + dir * len * t;
  vec4 vp = modelViewMatrix * vec4(p, 1.0);
  vec3 vd = mat3(modelViewMatrix) * dir;
  vec2 across = normalize(vec2(-vd.y, vd.x) + vec2(1e-4, 0.0));
  vp.xy += across * side * uWidth * (1.0 - 0.85 * t) * step(0.01, len);
  gl_Position = projectionMatrix * vp;
  vN = normalize(normalMatrix * normalize(n + 0.35 * comb));
  vT = t;
  vUv = aUv;
  vSeed = aSeed.y;
}`

const STRAND_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec3 vN;
varying float vT;
varying vec2 vUv;
varying float vSeed;
${SHADE_GLSL}
void main() {
  vec3 dye = texture(uMap, vUv).rgb;
  float L = 0.45 + 0.4 * vT;
  vec3 col = furShade(normalize(vN), dye, L, 0.5 + 0.3 * vSeed, 0.0);
  // the tip thins out (alpha to coverage: a soft end, no sorting needed)
  float alpha = 1.0 - 0.75 * smoothstep(0.6, 1.0, vT);
  gl_FragColor = vec4(col, alpha * uOpacity);
  #include <colorspace_fragment>
}`

/** The noise cube, shared by every coat of the page. */
let noiseTexture: Data3DTexture | null = null
function noise(): Data3DTexture {
  if (noiseTexture) return noiseTexture
  const t = new Data3DTexture(noiseVolume(), NOISE_SIDE, NOISE_SIDE, NOISE_SIDE)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.minFilter = t.magFilter = LinearFilter
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
  t.unpackAlignment = 1
  t.needsUpdate = true
  noiseTexture = t
  return t
}

/** One strand: 5 rows of 2 vertices, `x` = position along it (0 root, 1 tip), `y` = side. */
function strandStrip(): { position: Float32Array; index: Uint16Array } {
  const rows = 5
  const position = new Float32Array(rows * 2 * 3)
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1)
    position.set([t, -1, 0, t, 1, 0], r * 6)
  }
  const index: number[] = []
  for (let r = 0; r < rows - 1; r++) {
    const a = 2 * r
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  return { position, index: new Uint16Array(index) }
}

export class FurCoat {
  readonly group = new Group()
  /**
   * every shell in ONE draw: the body geometry, instanced once per layer (`aLayer`). Eleven separate meshes cost eleven
   * draw calls per Mochi, which was most of the Plush style's extra time (24/11/2026).
   */
  private readonly shells: Mesh<InstancedBufferGeometry, ShaderMaterial>
  private readonly shellGeo = new InstancedBufferGeometry()
  private readonly aLayer = new InstancedBufferAttribute(new Float32Array(FUR.shells + 1), 1)
  /** body geometry the shells were last bound to */
  private shellsOf: BufferGeometry | null = null
  private readonly strands: Mesh<InstancedBufferGeometry, ShaderMaterial>
  private readonly strandGeo: InstancedBufferGeometry
  private readonly aRoot: InstancedBufferAttribute
  private readonly aNormal: InstancedBufferAttribute
  private readonly aUv: InstancedBufferAttribute
  private readonly aSeed: InstancedBufferAttribute
  private readonly socketCanvas: HTMLCanvasElement
  private readonly socketHalf: HTMLCanvasElement
  readonly socket: CanvasTexture
  private pick: RootPick | null = null
  private pickOf: ArrayLike<number> | null = null
  /** last geometry and position version the roots were read from: unchanged, nothing is uploaded again */
  private placed = ''
  private detail: FurDetail | null = null
  /** pile height uniform, shared by the shells and the strands (re-read from `FUR` every frame) */
  private readonly len = { value: FUR.length }

  constructor(map: Texture, eyes: Texture) {
    this.socketCanvas = document.createElement('canvas')
    this.socketCanvas.width = this.socketCanvas.height = SOCKET_SIDE
    this.socketHalf = document.createElement('canvas')
    this.socketHalf.width = this.socketHalf.height = SOCKET_SIDE * 2
    this.socket = new CanvasTexture(this.socketCanvas)
    this.socket.minFilter = this.socket.magFilter = LinearFilter
    this.socket.generateMipmaps = false
    const len = this.len
    const m = new ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      uniforms: {
        uLen: len,
        uNoise: { value: noise() },
        uMap: { value: map },
        uEyes: { value: eyes },
        uSocket: { value: this.socket },
        uGrain: { value: 1 },
        uOpacity: { value: 1 }
      }
    })
    // no alpha to coverage on the shells: its dither showed as a light speckle all over the face
    this.shellGeo.setAttribute('aLayer', this.aLayer)
    this.shells = new Mesh(this.shellGeo, m)
    this.shells.frustumCulled = false
    this.shells.renderOrder = 1
    this.group.add(this.shells)
    const strip = strandStrip()
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', new BufferAttribute(strip.position, 3))
    g.setIndex(new BufferAttribute(strip.index, 1))
    const n = FUR.strands
    this.aRoot = new InstancedBufferAttribute(new Float32Array(n * 3), 3)
    this.aNormal = new InstancedBufferAttribute(new Float32Array(n * 3), 3)
    this.aUv = new InstancedBufferAttribute(new Float32Array(n * 2), 2)
    this.aSeed = new InstancedBufferAttribute(new Float32Array(n * 2), 2)
    g.setAttribute('aRoot', this.aRoot)
    g.setAttribute('aNormal', this.aNormal)
    g.setAttribute('aUv', this.aUv)
    g.setAttribute('aSeed', this.aSeed)
    g.instanceCount = 0
    this.strandGeo = g
    const sm = new ShaderMaterial({
      vertexShader: STRAND_VERTEX,
      fragmentShader: STRAND_FRAGMENT,
      uniforms: {
        uLen: len,
        uWidth: { value: FUR.strandWidth },
        uLenRange: { value: FUR.strandLength },
        uMap: { value: map },
        uSocket: { value: this.socket },
        uOpacity: { value: 1 }
      }
    })
    sm.alphaToCoverage = true
    this.strands = new Mesh(g, sm)
    this.strands.frustumCulled = false
    this.strands.renderOrder = 2
    this.group.add(this.strands)
  }

  /**
   * The socket map: the eye mask, shrunk to `SOCKET_SIDE` pixels (two halvings with smoothing, an average). Read with
   * linear filtering it is a soft blur of the eyes: 1 inside, about 0.5 on the edge, 0 a few units away.
   */
  paintSocket(eyes: HTMLCanvasElement) {
    const h = this.socketHalf.getContext('2d')!
    h.imageSmoothingEnabled = true
    h.imageSmoothingQuality = 'high'
    h.clearRect(0, 0, SOCKET_SIDE * 2, SOCKET_SIDE * 2)
    h.drawImage(eyes, 0, 0, SOCKET_SIDE * 2, SOCKET_SIDE * 2)
    const c = this.socketCanvas.getContext('2d')!
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'high'
    c.clearRect(0, 0, SOCKET_SIDE, SOCKET_SIDE)
    c.drawImage(this.socketHalf, 0, 0, SOCKET_SIDE, SOCKET_SIDE)
    this.socket.needsUpdate = true
  }

  /**
   * Dresses this frame's body `geo`. `pxPerUnit` and the page's load `level` (`FUR_LEVELS`) set the detail; `opacity`
   * follows the body's.
   */
  update(geo: BufferGeometry, opacity: number, pxPerUnit: number, level = 1) {
    const d = furDetail(pxPerUnit, level)
    this.len.value = FUR.length
    const changed = !this.detail || this.detail.shells !== d.shells
    this.detail = d
    const transparent = opacity < 1
    if (geo !== this.shellsOf) {
      // the instanced geometry reads the frame's body attributes as they are (no copy)
      this.shellsOf = geo
      for (const name of ['position', 'normal', 'uv'] as const) {
        const a = geo.attributes[name]
        if (a) this.shellGeo.setAttribute(name, a)
      }
      this.shellGeo.setIndex(geo.index)
    }
    if (changed) {
      for (let i = 0; i <= d.shells; i++) this.aLayer.array[i] = i / d.shells
      this.aLayer.needsUpdate = true
    }
    this.shellGeo.instanceCount = d.shells + 1
    const u = this.shells.material.uniforms
    u.uGrain!.value = d.grain
    u.uOpacity!.value = opacity
    this.shells.material.transparent = transparent
    const sm = this.strands.material
    sm.uniforms.uWidth!.value = d.strandWidth
    sm.uniforms.uOpacity!.value = opacity
    sm.transparent = transparent
    this.placeStrands(geo, d.strands)
  }

  private placeStrands(geo: BufferGeometry, n: number) {
    const pos = geo.attributes.position as BufferAttribute | undefined
    const nor = geo.attributes.normal as BufferAttribute | undefined
    const uv = geo.attributes.uv as BufferAttribute | undefined
    const index = geo.index
    if (!pos || !nor || !uv || !index) {
      this.strandGeo.instanceCount = 0
      return
    }
    // the same topology keeps the same roots: the shape breathes, its roots move with it
    if (this.pickOf !== index.array || !this.pick) {
      this.pick = pickRoots(pos.array, index.array, FUR.strands)
      this.pickOf = index.array
      this.aSeed.array.set(this.pick.seeds)
      this.aSeed.needsUpdate = true
      this.placed = ''
    }
    const key = `${geo.uuid}|${pos.version}|${nor.version}|${n}`
    if (key !== this.placed) {
      this.placed = key
      placeRoots(this.pick, n, pos.array, nor.array, uv.array, this.aRoot.array as Float32Array, this.aNormal.array as Float32Array, this.aUv.array as Float32Array)
      for (const a of [this.aRoot, this.aNormal, this.aUv]) {
        a.clearUpdateRanges()
        a.addUpdateRange(0, n * a.itemSize)
        a.needsUpdate = true
      }
    }
    this.strandGeo.instanceCount = n
  }

  dispose() {
    this.shells.material.dispose()
    this.shellGeo.dispose()
    this.strands.material.dispose()
    this.strandGeo.dispose()
    this.socket.dispose()
  }
}
