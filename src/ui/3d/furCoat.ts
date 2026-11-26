/**
 * The Plush coat in Three.js (v2, 24/11/2026). The technique and the shaders are open-bot-avatar's "fluffy" material
 * (`packages/core/src/dom/fluffy/shaders.ts` and `renderer.ts`), Copyright (c) 2026 Dominik Scholz, MIT License (see
 * LICENSE), ported to our scene:
 *
 * - One program draws three kinds of geometry: the body's solid surface with the eyes seated in it as glossy beads
 *   (white in the light theme, black in the dark one, like every style's eyes),
 *   shells of pile lifted off that surface, and single strands on top (tens of thousands, over the whole body). All
 *   three sample the same model-space pile, so the coat holds together as the Mochi turns.
 * - Their shader works in THEIR units and axes (a 100-unit viewBox, y down). Ours: engine units (a Mochi is 200 wide),
 *   y up. The vertex shader converts in (`F`, `FUR_SCALE`), runs their math as is, and converts the result back.
 * - Our body changes every frame (breathing, squash, morph): the strands are rooted on triangles of the body mesh and
 *   read their three corners from a float texture of the frame's vertices (`uPos`, `uNor`), so placing 50 000 strands
 *   costs the CPU nothing but that upload.
 * - Their eyes are marks with a distance tile each; ours are painted by the engine in the eye mask. The socket field
 *   is one signed distance field over both eyes, rebuilt from the mask when the eyes change (`furSocket.ts`).
 * - Two draws: the body and every shell in one instanced draw, then the strands.
 *
 * This module is loaded with `scene3d.ts`, never statically.
 */

import {
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Data3DTexture,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType
} from './three'
import { FUR, FUR_SCALE, furDetail, pickRoots, rootCount, rootsIn, ROOT_SIDE, rootVolume, surfaceArea, type RootPick } from './fur'
import { beadInk, DYE_RAMP_RANGE, DYE_RAMP_SIZE, dyeRamp, rgbOf } from './furDye'
import { exposedHeight, SOCKET_H, SOCKET_W, signedField, socketRect, type SocketRect } from './furSocket'
import { DARK_EYE } from './theme'

const float = (n: number) => (Number.isInteger(n) ? `${n}.` : `${n}`)

/** Width of the vertex textures (rows of this many vertices). */
const VERTEX_TEX_W = 1024
/** Vertices the textures hold (a Mochi body has about 4 800). */
const VERTEX_CAP = 8192

// Distance to the nearer eye's contour, THEIR units, from the socket field. Coordinates stay on the Mochi's front
// surface, so a socket turns with the head. (Ported; one field for both eyes instead of one tile per eye.)
const SOCKET_FIELD = /* glsl */ `
uniform highp sampler2D uSock;
uniform vec4 uSockRect;
uniform float uSockOn;
uniform vec2 uEyeC[2];
uniform vec2 uEyeS[2];
uniform float uScale;
const float FAR = ${float(FUR.socketPad)};

float socketDistance(vec3 p, vec3 normal, out vec2 uv, out vec3 local) {
  uv = vec2(0.);
  local = vec3(0.);
  if (uSockOn < .5 || normal.z < .03 || p.z < -.05) return FAR;
  vec2 s = (p.xy * uScale - uSockRect.xy) / uSockRect.zw;
  if (s.x <= 0. || s.y <= 0. || s.x >= 1. || s.y >= 1.) return FAR;
  float d = (textureLod(uSock, s, 0.).r - .5) * ${float(2 * FUR.socketPad)};
  if (d >= 3.77) return FAR;
  uv = s;
  bool left = distance(p.xy, uEyeC[0]) <= distance(p.xy, uEyeC[1]);
  vec2 c = left ? uEyeC[0] : uEyeC[1];
  vec2 sz = left ? uEyeS[0] : uEyeS[1];
  local.xy = 2. * (p.xy - c) / max(sz, vec2(.01));
  // As lids close, the pressed lip narrows with the expression.
  local.z = smoothstep(.35, 1.5, sz.y / max(.01, sz.x));
  return d * mix(1.5, 1., local.z);
}`

const COMMON = /* glsl */ `
const int BODY = 0, SHELL = 1, STRAND = 2;
// their axes: y down
const mat3 F = mat3(1., 0., 0., 0., -1., 0., 0., 0., 1.);
varying vec3 P, N, V, pilePosition, lean;
varying float tip, variation, across, pocketDepth, vShell;
flat varying int vPass;
flat varying vec3 vView0, vView1, vView2;
`

const VERTEX = /* glsl */ `
${COMMON}
uniform vec3 uPivot, uExtent;
uniform float uStrandWidth;
#ifdef STRAND_PASS
attribute vec3 aCorner;
attribute vec2 aWeight;
attribute vec2 aSeed;
uniform highp sampler2D uPos;
uniform highp sampler2D uNor;
vec3 corner(highp sampler2D t, float i) {
  int k = int(i + .5);
  return texelFetch(t, ivec2(k % ${VERTEX_TEX_W}, k / ${VERTEX_TEX_W}), 0).xyz;
}
#else
attribute float aLayer;
#endif
${SOCKET_FIELD}

void main() {
  mat3 view = F * mat3(modelViewMatrix) * F;
#ifdef STRAND_PASS
  int pass = STRAND;
  float w0 = 1. - aWeight.x - aWeight.y;
  vec3 ourP = w0 * corner(uPos, aCorner.x) + aWeight.x * corner(uPos, aCorner.y) + aWeight.y * corner(uPos, aCorner.z);
  vec3 ourN = w0 * corner(uNor, aCorner.x) + aWeight.x * corner(uNor, aCorner.y) + aWeight.y * corner(uNor, aCorner.z);
  vec2 seed = aSeed;
  int vid = int(position.x + .5);
  float shell = 0.;
#else
  int pass = aLayer < .001 ? BODY : SHELL;
  vec3 ourP = position;
  vec3 ourN = normal;
  vec2 seed = vec2(.5);
  int vid = 0;
  float shell = aLayer;
#endif
  vec3 position = F * ourP / uScale;
  vec3 n = normalize(F * ourN), p = position;
  vec3 rounded = (position - uPivot) / uExtent;
  // Broadly bend the lighting normals across flat front faces of inflated paths.
  vec3 shadingNormal = normalize(n + .78 * rounded);
  pilePosition = position;
  // Sweep across the visible surface. A downwards bias keeps the front from parting at a point.
  float wave = .21 * sin(dot(position, vec3(.11, .045, .08))) + .14 * sin(.13 * position.y - .07 * position.z);
  float angle = .22 + .94 * (view * shadingNormal).x + wave;
  vec3 sweep = transpose(view) * vec3(sin(angle), cos(angle), .18);
  lean = sweep - n * dot(n, sweep);

  vec2 uv;
  vec3 local;
  float d = socketDistance(position, n, uv, local);
  float seat = min(1.55, max(0., position.z) * .40);
  // The rounded cap sits below the packed pile at the mouth of the socket.
  float dome = sqrt(max(0., 1. - dot(local.xy, local.xy)));
  float cap = mix(smoothstep(0., 1.3, -d), dome, local.z) * smoothstep(-.15, .38, -d);
  float floorDepth = 1. - smoothstep(-.15, 1.65, d);
  p.z += seat * (.56 * cap - .98 * floorDepth);
  // Compressed fibers lie along the lip: the opening has a continuous, softly fuzzy edge.
  float loft = mix(.07, 1., smoothstep(.75, 3.7, d));
  float lip = smoothstep(-.10, 1., d) * (1. - smoothstep(1., 2.85, d));
  if (pass == BODY) p.z += seat * .15 * lip;
  pilePosition.z = p.z;

  tip = 0.;
  variation = .5;
  across = 0.;
  if (pass == SHELL) {
    p += n * shell * 1.10 * loft;
    p += lean * (1.05 * shell * loft);
  }
  if (pass == STRAND) {
    // Four cross-sections make a bent, tapered strand. Roots are fixed on the body.
    tip = float(vid / 2) / 3.;
    across = float(vid % 2) * 2. - 1.;
    vec3 tangent = normalize(cross(n, abs(n.y) < .93 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
    vec3 bitangent = cross(n, tangent);
    float flow = 2.3 * sin(.24 * p.x + .13 * p.z + sin(.22 * p.y)) + 1.3 * sin(.32 * p.y - .15 * p.x);
    float ang = flow + (seed.x - .5) * 2.6;
    vec3 comb = lean + .24 * (tangent * cos(ang) + bitangent * sin(ang));
    if (d < 3.5) {
      // Around a socket the strands lie along its edge.
      vec2 radial = normalize(local.xy * vec2(1.7, 1.) + vec2(.001));
      vec2 alongEdge = vec2(-radial.y, radial.x);
      comb.xy = mix(comb.xy, alongEdge * (dot(comb.xy, alongEdge) < 0. ? -1. : 1.), .88 * (1. - smoothstep(.4, 3.5, d)));
    }
    vec3 bend = cross(n, comb);
    float len = mix(1.6, 3.8, seed.y) * loft;
    vec3 direction = n * (.30 + .18 * tip) + comb * (.93 - .12 * tip) + bend * (seed.x - .5) * .45 * tip;
    pilePosition += comb * (.7 * len * tip);
    p += n * .52 * loft;
    float width = (.073 + .11 * seed.y) * uStrandWidth;
    p += .065 * n + len * tip * direction;
    vec3 screenDir = view * (direction + .06 * comb);
    vec2 widthDir = normalize(vec2(-screenDir.y, screenDir.x) + vec2(.0001, 0));
    p += transpose(view) * vec3(widthDir * across * width * (1. - .94 * tip), 0);
    shadingNormal = normalize(shadingNormal + .19 * comb);
    variation = seed.x;
  }

  pocketDepth = dot(position - p, n) / max(.01, seat);
  P = vec3(p.xy, position.z);
  N = view * shadingNormal;
  V = n;
  vPass = pass;
  vShell = shell;
  vView0 = view[0];
  vView1 = view[1];
  vView2 = view[2];
  gl_Position = projectionMatrix * modelViewMatrix * vec4(F * (p * uScale), 1.);
#ifdef STRAND_PASS
  // Not in the original (which renders a coat once per view): drawn every frame here, so a strand that cannot show is
  // dropped at its vertices, not shaded. Strands on the far side of the body (well past the silhouette), and strands
  // inside a socket (the original discards them per fragment, which also turned off early depth testing).
  if ((view * n).z < -.35 || d < .10 - .08 * seed.x) gl_Position = vec4(2., 2., 2., 1.);
#endif
}`

const FRAGMENT = /* glsl */ `
${COMMON}
uniform sampler2D uFibers;
uniform sampler2D uDye;
uniform highp sampler3D uRoots;
uniform vec3 uColor, uInk;
uniform float uOpacity;
${SOCKET_FIELD}

float fiberMap(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(5.));
  w /= max(.001, w.x + w.y + w.z);
  return dot(w, vec3(texture(uFibers, p.zy / 16.).r, texture(uFibers, p.xz / 16.).r, texture(uFibers, p.xy / 16.).r));
}

// Sample the same model-space roots at every view: only the direction of the short filter changes. The solid coat,
// the shells and the strands all use this one field.
float brushedHeight() {
  vec3 uvw = pilePosition / 15.;
  vec3 stepUV = lean * .019;
  float locks = 4. * texture(uRoots, uvw).r;
  for (int i = 1; i <= 3; i++) {
    vec3 delta = float(i) * stepUV;
    locks += (4. - float(i)) * (texture(uRoots, uvw + delta).r + texture(uRoots, uvw - delta).r);
  }
  float tuft = texture(uRoots, uvw * .42).r;
  return clamp(.5 + 1.65 * (locks / 16. - .5) + .16 * (tuft - .5), 0., 1.);
}

// The strands' share of the same field, cheaper: no brushing filter (a strand is one lock already).
float strandHeight() {
  vec3 uvw = pilePosition / 15.;
  float tuft = texture(uRoots, uvw * .42).r;
  return clamp(.5 + 1.65 * (texture(uRoots, uvw).r - .5) * .55 + .16 * (tuft - .5), 0., 1.);
}

void main() {
  int pass = vPass;
  float shell = vShell;
  mat3 view = mat3(vView0, vView1, vView2);
  vec3 n = normalize(N);
  vec3 light = normalize(vec3(-.52, -.83, .62));
  float diffuse = dot(n, light);
  float wrap = clamp((diffuse + .65) / 1.65, 0., 1.);
  float facingLight = clamp(.66 + .34 * diffuse, 0., 1.);
  float diffuseLevel = .87 + .13 * wrap;
  float sheen = .014 * wrap * wrap;
  float rimExposure = 1.;

  // Pile gives way to the eye.
  vec2 uv;
  vec3 local;
  float d = socketDistance(P, normalize(V), uv, local);
  if (pass == SHELL && d < .1) discard;
  float height = pass == STRAND ? strandHeight() : brushedHeight();
  float pileFill = .925 + .075 * smoothstep(.22, .81, height);
  if (pass == STRAND) {
    float edge = min(1., abs(across));
    float glint = smoothstep(.08, .82, tip) * (1. - .32 * edge * edge);
    diffuseLevel *= .935 + .11 * variation + .035 * clamp(tip, 0., 1.);
    sheen += (.012 + .20 * glint) * (.44 + .56 * variation) * facingLight;
  } else {
    float layer = pass == SHELL ? shell : 0.;
    // A shell keeps only the locks that reach its height.
    if (pass == SHELL && height < .21 + .59 * layer) discard;
    diffuseLevel *= .895 + .16 * height + .035 * layer;
    sheen += (.012 + .13 * smoothstep(.41, .86, height) + .022 * layer) * facingLight;
    rimExposure = .80 + .34 * layer;
  }

  // A soft light behind the right shoulder grazes the pile, confined to the silhouette.
  float grazing = 1. - smoothstep(.09, .83, abs(n.z));
  float backlit = smoothstep(-.20, .79, dot(n.xy, vec2(.66, -.75)));

  // Around a socket: a crease where the pile is pressed down, and light on its rolled lip.
  float upper = 0., crease = 0., pileRelief = 0., contact = 0., lipLight = 0.;
  if (d < 3.7) {
    vec2 texel = 1. / vec2(${SOCKET_W}., ${SOCKET_H}.);
    vec2 g = vec2(texture(uSock, uv + vec2(texel.x, 0)).r - texture(uSock, uv - vec2(texel.x, 0)).r,
                  texture(uSock, uv + vec2(0, texel.y)).r - texture(uSock, uv - vec2(0, texel.y)).r);
    vec2 outward = g / max(length(g), .001);
    upper = dot(outward, normalize(vec2(.96, -.28)));
    float fibers = fiberMap(P, normalize(V));
    float buried = smoothstep(-.12, .82, pocketDepth);
    crease = (1. - smoothstep(-.12, 1.65 + 1.30 * upper + .6 * (fibers - .5), d)) * mix(.24, 1., buried);
    if (pass == STRAND) {
      pileRelief = ((tip - .46) * .16 + (fibers - .48) * .11) * (1. - smoothstep(1.5, 3.65, d));
    }
    contact = (1. - smoothstep(-.04, .38, d)) * mix(.35, 1., buried);
    float lip = smoothstep(.03, .49, d) * (1. - smoothstep(1.10, 3.65, d));
    float gathered = clamp(.22 - .52 * outward.x + 1.14 * outward.y, 0., 1.22);
    float tipLight = .14 + .22 * fibers;
    lipLight = tipLight * gathered * lip * mix(.40, 1., local.z);
  }
  float occlusion = crease * (.76 + .18 * upper);
  float fiberLight = (sheen + .46 * grazing * backlit * rimExposure) * (1. - crease) + lipLight;
  diffuseLevel = (diffuseLevel * (1. - .48 * occlusion) + pileRelief) * (1. - (.36 + .04 * upper) * contact);

  float backing = diffuseLevel * pileFill;
  float exposure = backing * backing * (.72 + .39 * wrap) + 1.45 * fiberLight * pileFill;
  vec4 ramp = texture(uDye, vec2(exposure / ${float(DYE_RAMP_RANGE)}, .5));
  vec3 base = ramp.rgb;
  if (ramp.a > 0.) {
    float value = max(uColor.r, max(uColor.g, uColor.b));
    vec3 dye = uColor / max(value, .001);
    float weakest = min(dye.r, min(dye.g, dye.b));
    vec3 scatter = (1. - dye) * (.09 + .91 * (dye - weakest)) * clamp(1.85 * fiberLight, 0., 1.);
    float brightness = clamp(value * diffuseLevel + (.35 + .65 * value) * fiberLight, 0., 1.);
    base = mix(base, (dye + scatter) * brightness * pileFill, ramp.a);
  }

  if (pass == BODY && d < 3.7) {
    // The eye: a glossy bead in the socket.
    vec2 curve = local.xy * .94;
    vec3 dome = normalize(vec3(curve, sqrt(max(.02, 1. - dot(curve, curve)))));
    vec3 beadNormal = normalize(view * dome);
    vec2 key = beadNormal.xy - vec2(.59, -.865);
    key = vec2(key.x - .76 * key.y, key.y) / vec2(.55, .70);
    vec2 fill = beadNormal.xy - vec2(.61, -.195);
    fill = vec2(fill.x - .37 * fill.y, fill.y) / vec2(.47, 1.01);
    float stripLight = .38 * exp(-dot(key, key));
    float sideLight = .13 * exp(-dot(fill, fill));
    float coatBounce = .003 + .018 * pow(1. - clamp(beadNormal.z, 0., 1.), 1.6);
    float inkValue = max(uInk.r, max(uInk.g, uInk.b));
    // The bead takes the eye color of the theme (white in light, black in dark), like the eyes of the other styles.
    // A dark bead: as ported. A light bead: a porcelain dome kept a shade under its color, darker where the lip of
    // the socket shades its edge, so that the reflection and the socket still read on it.
    vec3 darkBead = uInk * sqrt(inkValue) * (.40 + .24 * beadNormal.z + .24 * inkValue) + uColor * coatBounce;
    float rimShade = mix(.70, 1., smoothstep(-.05, 1.1, -d));
    vec3 lightBead = uInk * (.80 + .13 * beadNormal.z) * rimShade + uColor * coatBounce * 3.;
    float light = smoothstep(.3, .7, inkValue);
    vec3 bead = mix(darkBead, lightBead, light);
    vec3 reflection = mix(vec3(1.), uColor, .28) * stripLight + mix(vec3(1.), uColor, .72) * sideLight;
    bead += reflection * smoothstep(-.12, .55, -d) * mix(1., .8, light);
    float aa = max(.15, fwidth(d));
    base = mix(bead, base, smoothstep(-aa * .5, aa * .5, d));
  }
  // sRGB values, written as is (no output conversion), like the original
  gl_FragColor = vec4(base, uOpacity);
}`

/* --------------------------------------------------------------- shared textures */

let rootsTexture: Data3DTexture | null = null
function roots3d(): Data3DTexture {
  if (rootsTexture) return rootsTexture
  const t = new Data3DTexture(rootVolume(), ROOT_SIDE, ROOT_SIDE, ROOT_SIDE)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.magFilter = LinearFilter
  t.minFilter = LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
  t.unpackAlignment = 1
  t.needsUpdate = true
  rootsTexture = t
  return t
}

/** Seeded, so the pile is the same on every page load. */
function randomFrom(seed: number): () => number {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
}

let fibersTexture: CanvasTexture | null = null
/** A tileable texture of short curved fibers, for the compressed pile around the eye sockets (ported). */
function fibers(): CanvasTexture {
  if (fibersTexture) return fibersTexture
  const size = 128
  const tile = document.createElement('canvas')
  tile.width = tile.height = size
  const g = tile.getContext('2d')!
  g.fillStyle = '#252525'
  g.fillRect(0, 0, size, size)
  g.lineCap = 'round'
  const random = randomFrom(9213)
  for (let i = 0; i < 1400; i++) {
    const x = random() * size
    const y = random() * size
    const angle = 2.4 * Math.sin((y * Math.PI) / 32) + 1.4 * Math.cos((x * Math.PI) / 32) + (random() - 0.5) * 3.3
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const length = 3 + random() * 8
    const curl = (random() - 0.5) * length
    const grey = Math.round(55 + 200 * random())
    g.strokeStyle = `rgb(${grey} ${grey} ${grey})`
    g.lineWidth = 0.8 + random() * 1.5
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -12 || x + ox > size + 12 || y + oy < -12 || y + oy > size + 12) continue
        g.beginPath()
        g.moveTo(x + ox, y + oy)
        g.quadraticCurveTo(x + ox + dx * length * 0.5 - dy * curl, y + oy + dy * length * 0.5 + dx * curl, x + ox + dx * length, y + oy + dy * length)
        g.stroke()
      }
    }
  }
  const t = new CanvasTexture(tile)
  t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = NoColorSpace
  fibersTexture = t
  return t
}

/** One strand: 4 cross-sections of 2 vertices (`position.x` = vertex number, as `gl_VertexID` in the original). */
function strandStrip(): { position: Float32Array; index: Uint16Array } {
  const position = new Float32Array(8 * 3)
  for (let i = 0; i < 8; i++) position[i * 3] = i
  const index: number[] = []
  for (let r = 0; r < 3; r++) {
    const a = 2 * r
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  return { position, index: new Uint16Array(index) }
}

export class FurCoat {
  readonly group = new Group()
  private readonly body: Mesh<InstancedBufferGeometry, ShaderMaterial>
  private readonly bodyGeo = new InstancedBufferGeometry()
  private readonly aLayer = new InstancedBufferAttribute(new Float32Array(FUR.shells + 1), 1)
  private bodyOf: BufferGeometry | null = null
  private readonly strands: Mesh<InstancedBufferGeometry, ShaderMaterial>
  private readonly strandGeo = new InstancedBufferGeometry()
  private pick: RootPick | null = null
  private pickKey = ''
  private readonly posTex: DataTexture
  private readonly norTex: DataTexture
  private placed = ''
  private readonly dye: DataTexture
  private dyeOf = ''
  private readonly sock: DataTexture
  private readonly sockCanvas: HTMLCanvasElement
  private readonly uniforms: Record<string, { value: unknown }>
  private shellsShown = -1
  /** bead color the uniform holds (`eyeColor` of the theme) */
  private eyeOf = ''

  constructor() {
    this.posTex = new DataTexture(new Float32Array(VERTEX_CAP * 4), VERTEX_TEX_W, VERTEX_CAP / VERTEX_TEX_W, RGBAFormat, FloatType)
    this.norTex = new DataTexture(new Float32Array(VERTEX_CAP * 4), VERTEX_TEX_W, VERTEX_CAP / VERTEX_TEX_W, RGBAFormat, FloatType)
    this.dye = new DataTexture(new Uint8Array(DYE_RAMP_SIZE * 4), DYE_RAMP_SIZE, 1, RGBAFormat, UnsignedByteType)
    this.dye.minFilter = this.dye.magFilter = LinearFilter
    this.dye.wrapS = this.dye.wrapT = ClampToEdgeWrapping
    this.dye.colorSpace = NoColorSpace
    this.sock = new DataTexture(new Uint8Array(SOCKET_W * SOCKET_H).fill(255), SOCKET_W, SOCKET_H, RedFormat, UnsignedByteType)
    this.sock.minFilter = this.sock.magFilter = LinearFilter
    this.sock.wrapS = this.sock.wrapT = ClampToEdgeWrapping
    this.sock.unpackAlignment = 1
    this.sock.needsUpdate = true
    this.sockCanvas = document.createElement('canvas')
    this.sockCanvas.width = SOCKET_W
    this.sockCanvas.height = SOCKET_H
    // one set of uniform objects, shared by both programs
    this.uniforms = {
      uPivot: { value: [0, 0, 0] },
      uExtent: { value: [1, 1, 1] },
      uStrandWidth: { value: 1 },
      uScale: { value: FUR_SCALE },
      uSock: { value: this.sock },
      uSockRect: { value: [0, 0, 1, 1] },
      uSockOn: { value: 0 },
      uEyeC: { value: [-1e4, -1e4, -1e4, -1e4] },
      uEyeS: { value: [1, 1, 1, 1] },
      uFibers: { value: fibers() },
      uDye: { value: this.dye },
      uRoots: { value: roots3d() },
      uColor: { value: [1, 1, 1] },
      uInk: { value: beadInk(DARK_EYE) },
      uOpacity: { value: 1 },
      uPos: { value: this.posTex },
      uNor: { value: this.norTex }
    }
    const mat = (strand: boolean) =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: this.uniforms,
        defines: strand ? { STRAND_PASS: '' } : {}
      })
    this.bodyGeo.setAttribute('aLayer', this.aLayer)
    this.body = new Mesh(this.bodyGeo, mat(false))
    this.body.frustumCulled = false
    this.body.renderOrder = 1
    this.group.add(this.body)
    const strip = strandStrip()
    this.strandGeo.setAttribute('position', new BufferAttribute(strip.position, 3))
    this.strandGeo.setIndex(new BufferAttribute(strip.index, 1))
    this.strandGeo.instanceCount = 0
    this.strands = new Mesh(this.strandGeo, mat(true))
    this.strands.frustumCulled = false
    this.strands.renderOrder = 2
    this.group.add(this.strands)
  }

  /**
   * The sockets: the engine's eyes (path, matrix, opacity; engine units, y down) painted white on black in a small
   * CPU canvas cropped around them, then turned into a signed distance field. Painting them here (and not copying the
   * eye mask texture) keeps the read-back off the GPU: copying the mask cost 3.6 ms a frame.
   */
  paintSockets(eyes: Array<{ d: string; m: number[]; alpha: number; x: number; y: number; r: number }>) {
    const rect = socketRect(eyes, FUR.socketPad * FUR_SCALE + 4)
    this.uniforms.uSockOn!.value = rect ? 1 : 0
    if (!rect) return
    const c = this.sockCanvas.getContext('2d', { willReadFrequently: true })!
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalAlpha = 1
    c.fillStyle = '#000'
    c.fillRect(0, 0, SOCKET_W, SOCKET_H)
    const k = SOCKET_W / rect.w
    c.fillStyle = '#fff'
    for (const e of eyes) {
      const [a, b, cc, d, tx, ty] = e.m as [number, number, number, number, number, number]
      c.setTransform(k * a, k * b, k * cc, k * d, k * (tx - rect.x0), k * (ty - rect.y0))
      c.globalAlpha = e.alpha
      c.fill(new Path2D(e.d))
    }
    const rgba = c.getImageData(0, 0, SOCKET_W, SOCKET_H).data
    const coverage = new Uint8Array(SOCKET_W * SOCKET_H)
    for (let i = 0; i < coverage.length; i++) coverage[i] = rgba[i * 4]!
    this.eyesFrom(coverage, rect)
    const field = signedField(coverage, SOCKET_W, SOCKET_H, rect.w / FUR_SCALE / SOCKET_W, FUR.socketPad)
    ;(this.sock.image.data as Uint8Array).set(field)
    this.sock.needsUpdate = true
    this.uniforms.uSockRect!.value = [rect.x0, rect.y0, rect.w, rect.h]
  }

  /** Eye centers and sizes from the coverage (left and right halves of the field), their units. */
  private eyesFrom(coverage: Uint8Array, rect: SocketRect) {
    const C: number[] = []
    const S: number[] = []
    const px = rect.w / SOCKET_W
    for (const half of [0, 1]) {
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (let y = 0; y < SOCKET_H; y++) {
        for (let x = half * (SOCKET_W / 2); x < (half + 1) * (SOCKET_W / 2); x++) {
          if (coverage[y * SOCKET_W + x]! < 128) continue
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x + 1)
          y0 = Math.min(y0, y)
          y1 = Math.max(y1, y + 1)
        }
      }
      if (x1 < x0) {
        C.push(-1e4, -1e4)
        S.push(1, 1)
        continue
      }
      const w = ((x1 - x0) * px) / FUR_SCALE
      const h = ((y1 - y0) * px) / FUR_SCALE
      C.push((rect.x0 + ((x0 + x1) / 2) * px) / FUR_SCALE, (rect.y0 + ((y0 + y1) / 2) * px) / FUR_SCALE)
      S.push(w, h * exposedHeight(w, h))
    }
    this.uniforms.uEyeC!.value = C
    this.uniforms.uEyeS!.value = S
  }

  /**
   * Dresses this frame's body `geo` in `color` (`#rrggbb`), with bead eyes in `eye` (the theme's eye color,
   * `eyeColor` in `theme.ts`: white in light, black in dark). `pxPerUnit` and the page's load `level` set the detail.
   */
  update(geo: BufferGeometry, color: string, eye: string, opacity: number, pxPerUnit: number, level = 1) {
    const pos = geo.attributes.position as BufferAttribute | undefined
    const nor = geo.attributes.normal as BufferAttribute | undefined
    const index = geo.index
    if (!pos || !nor || !index) return
    const d = furDetail(pxPerUnit, level)
    const u = this.uniforms
    // the dye ramp of this color (sRGB bytes, read as is: the shader works in sRGB like the original)
    if (color !== this.dyeOf) {
      this.dyeOf = color
      const rgb = rgbOf(color)
      ;(this.dye.image.data as Uint8Array).set(dyeRamp(rgb))
      this.dye.needsUpdate = true
      u.uColor!.value = rgb.map((v) => v / 255)
    }
    if (eye !== this.eyeOf) {
      this.eyeOf = eye
      u.uInk!.value = beadInk(eye)
    }
    u.uOpacity!.value = opacity
    this.body.material.transparent = this.strands.material.transparent = opacity < 1
    // where the body sits, their units and axes (pivot and half extents, for the bent normals)
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    u.uPivot!.value = [(bb.min.x + bb.max.x) / 2 / FUR_SCALE, -(bb.min.y + bb.max.y) / 2 / FUR_SCALE, 0]
    u.uExtent!.value = [
      (bb.max.x - bb.min.x) / 2 / FUR_SCALE,
      (bb.max.y - bb.min.y) / 2 / FUR_SCALE,
      Math.max(0.5, (bb.max.z - bb.min.z) / 2 / FUR_SCALE)
    ]
    // body and shells: one instanced draw on the frame's own attributes
    if (geo !== this.bodyOf) {
      this.bodyOf = geo
      this.bodyGeo.setAttribute('position', pos)
      this.bodyGeo.setAttribute('normal', nor)
      this.bodyGeo.setIndex(index)
    }
    if (d.shells !== this.shellsShown) {
      this.shellsShown = d.shells
      for (let i = 0; i <= d.shells; i++) this.aLayer.array[i] = i / d.shells
      this.aLayer.needsUpdate = true
    }
    this.bodyGeo.instanceCount = d.shells + 1
    // strands: rooted once per topology, their corners read from the vertex textures every frame
    const key = `${pos.count}|${index.count}`
    if (key !== this.pickKey) {
      this.pickKey = key
      this.rootStrands(pos.array, index.array)
    }
    const stamp = `${geo.uuid}|${pos.version}|${nor.version}`
    if (stamp !== this.placed) {
      this.placed = stamp
      const P = this.posTex.image.data as Float32Array
      const N = this.norTex.image.data as Float32Array
      const n = Math.min(pos.count, VERTEX_CAP)
      const pa = pos.array
      const na = nor.array
      for (let i = 0; i < n; i++) {
        P[i * 4] = pa[i * 3]!
        P[i * 4 + 1] = pa[i * 3 + 1]!
        P[i * 4 + 2] = pa[i * 3 + 2]!
        N[i * 4] = na[i * 3]!
        N[i * 4 + 1] = na[i * 3 + 1]!
        N[i * 4 + 2] = na[i * 3 + 2]!
      }
      this.posTex.needsUpdate = true
      this.norTex.needsUpdate = true
    }
    u.uStrandWidth!.value = d.strandWidth
    this.strandGeo.instanceCount = this.pick ? rootsIn(this.pick.count, d.passes) : 0
  }

  private rootStrands(pos: ArrayLike<number>, index: ArrayLike<number>) {
    const count = rootCount(surfaceArea(pos, index))
    const p = pickRoots(pos, index, count, 51821)
    this.pick = p
    const corner = new Float32Array(count * 3)
    const weight = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      corner[i * 3] = p.corners[i * 3]!
      corner[i * 3 + 1] = p.corners[i * 3 + 1]!
      corner[i * 3 + 2] = p.corners[i * 3 + 2]!
      weight[i * 2] = p.weights[i * 3 + 1]!
      weight[i * 2 + 1] = p.weights[i * 3 + 2]!
    }
    this.strandGeo.setAttribute('aCorner', new InstancedBufferAttribute(corner, 3))
    this.strandGeo.setAttribute('aWeight', new InstancedBufferAttribute(weight, 2))
    this.strandGeo.setAttribute('aSeed', new InstancedBufferAttribute(p.seeds, 2))
  }

  dispose() {
    this.body.material.dispose()
    this.strands.material.dispose()
    this.bodyGeo.dispose()
    this.strandGeo.dispose()
    this.posTex.dispose()
    this.norTex.dispose()
    this.dye.dispose()
    this.sock.dispose()
  }
}
