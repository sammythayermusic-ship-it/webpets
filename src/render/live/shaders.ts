// GLSL for candidate C's live layer. Kept as strings in one file so the TypeScript that wires the
// uniforms sits next to the code that reads them.

/**
 * Vertex-stage injection for every fish part: bends the mesh in the fish ROOT's frame.
 *
 * Each part is a child somewhere under the root with its own transform, so the vertex is carried into
 * root space (uToRoot), bent there by the travelling wave and the turn curl, and carried back
 * (uFromRoot) before Three's own modelViewMatrix applies. Root space: +x nose, +y up, +z the fish's
 * left; the goldfish (assets/3d/scripts/gf_shape.py) is rigid ahead of the gills at x = 0.045, hinges
 * its tail at x = -0.026 and ends at the lobe tips, x = -0.0605.
 *
 * Fins flutter from their OWN hinge: `uFinRoot` is where the fin meets the body (root space) and
 * `uFinLen` its longest ray, both exported with the mesh, so a fin's free edge moves and its root
 * stays put whatever its size or angle.
 */
export const FISH_VERTEX_PARS = /* glsl */ `
uniform mat4 uToRoot;
uniform mat4 uFromRoot;
uniform float uAmp;
uniform float uK;
uniform float uPhase;
uniform float uTurn;
uniform float uSway;
uniform float uFlutter;
uniform float uFlutterMode;
uniform float uTime;
uniform vec3 uFinRoot;
uniform float uFinLen;
varying vec3 vRootPos;

vec3 wpBend(vec3 pr, out float slope) {
  float x = pr.x;
  // Amplitude envelope: nothing ahead of the gills, quadratic to the tail tip.
  float s = clamp((0.045 - x) / 0.105, 0.0, 1.0);
  float s2 = s * s;
  float arg = uK * x - uPhase;
  float wave = sin(arg);
  float dz = uAmp * s2 * wave + uTurn * s2 + uSway * sin(uTime * 0.9 + x * 12.0);
  float dy = 0.0;
  slope = uAmp * s2 * uK * cos(arg);
  float f = clamp(distance(pr, uFinRoot) / max(uFinLen, 1e-4), 0.0, 1.0);
  if (uFlutterMode > 0.5 && uFlutterMode < 1.5) {
    // dorsal / anal: the free edge trails the beat, a ripple running back along the fin
    dz += uFlutter * 0.9 * f * f * sin(arg - 1.2 + pr.x * 220.0);
  } else if (uFlutterMode > 1.5 && uFlutterMode < 2.5) {
    // paired fins: the tips scull, the left and right half a beat apart
    float side = sign(uFinRoot.z);
    float scull = sin(uTime * 5.2 + side * 1.4 + pr.x * 90.0);
    dy += uFlutter * 0.9 * f * f * scull;
    dz += side * uFlutter * 0.5 * f * f * (0.6 + 0.4 * sin(uTime * 2.6 + side));
  } else if (uFlutterMode > 2.5) {
    // tail: beyond the hinge the fin lags the body and its tips flex more than its root
    float ft = clamp((-x - 0.026) / 0.035, 0.0, 1.0);
    float edge = clamp((abs(pr.y) - 0.004) / 0.018, 0.0, 1.0);
    dz += uFlutter * 1.4 * ft * sin(arg - 0.9) + uFlutter * edge * ft * sin(arg - 1.8 + pr.y * 60.0);
  }
  return vec3(pr.x, pr.y + dy, pr.z + dz);
}
`;

export const FISH_VERTEX_BEGIN = /* glsl */ `
vec4 wpPr = uToRoot * vec4(position, 1.0);
float wpSlope;
vec3 wpBent = wpBend(wpPr.xyz, wpSlope);
vRootPos = wpBent;
vec3 transformed = (uFromRoot * vec4(wpBent, 1.0)).xyz;
`;

export const FISH_NORMAL_BEGIN = /* glsl */ `
vec3 wpNr = mat3(uToRoot) * normal;
{
  float wpX = (uToRoot * vec4(position, 1.0)).x;
  float wpS = clamp((0.045 - wpX) / 0.105, 0.0, 1.0);
  float wpA = atan(uAmp * wpS * wpS * uK * cos(uK * wpX - uPhase));
  float c = cos(wpA);
  float s = sin(wpA);
  wpNr.xz = vec2(wpNr.x * c - wpNr.z * s, wpNr.x * s + wpNr.z * c);
}
vec3 objectNormal = mat3(uFromRoot) * wpNr;
`;

/**
 * Body: the subsurface glow at the thin edges. Where the body turns away from the camera light has
 * passed through less fish, so the silhouette goes warm and bright; more so toward the tail and the
 * belly, which are thinner. `uGlow` is the key light's colour times its strength, so it dims at night.
 */
export const FISH_BODY_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
{
  float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float graze = pow(1.0 - facing, 2.6);
  float thin = 0.45 + 0.55 * smoothstep(0.02, -0.024, vRootPos.x) + 0.25 * smoothstep(-0.004, -0.012, vRootPos.y);
  totalEmissiveRadiance += vec3(1.0, 0.42, 0.14) * uGlow * graze * thin * 0.30;
}
`;

/**
 * Fins: light through the membrane. A fin between the camera and the key light glows (the light
 * hits its far side), the thin membrane more than the rays (the map's alpha is the rays), and a
 * little always, because a fin scatters what passes through it.
 */
export const FISH_FIN_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 nV = normalize(normal);
  float behind = max(0.0, -dot(nV, normalize(uKeyView)));
  float membrane = 1.0 - 0.55 * clamp(diffuseColor.a, 0.0, 1.0);
  totalEmissiveRadiance += diffuseColor.rgb * uGlow * (0.26 + 0.55 * behind) * membrane;
}
`;

/** Uniforms the fragment chunks read; declared once for both. */
export const FISH_FRAGMENT_PARS = /* glsl */ `
varying vec3 vRootPos;
uniform vec3 uGlow;
uniform vec3 uKeyView;
`;

/**
 * The water pass: one full-canvas triangle drawn into the default framebuffer OVER the back plates
 * and UNDER the front plates. Everything is computed per pixel in GRID px so the ellipses in the
 * manifest describe the shapes directly.
 *
 * Outputs PREMULTIPLIED colour with alpha = water coverage, blended ONE / ONE_MINUS_SRC_ALPHA.
 * Outside the water the fish render target is passed straight through (a fin may brush the glass).
 */
export const WATER_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const WATER_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uBg;
uniform sampler2D uBgNight;
uniform sampler2D uDecor;      // the near decor plate, drawn OVER the fish, refracted the same way
uniform sampler2D uDecorNight;
uniform sampler2D uContents;   // grey: 1 where the bg plate shows a thing, 0 where it shows back wall
uniform sampler2D uFish;
uniform vec2 uCanvasCss;     // CSS px
uniform float uDpr;
uniform float uPad;          // CSS px
uniform float uCssPerGrid;
uniform vec2 uGrid;          // 320, 240
uniform vec4 uInner;         // cx, cy, rx, ry  (inner glass ellipse, grid px)
uniform vec4 uSurface;       // cx, cy, rx, ry  (waterline ellipse, grid px)
uniform float uFloorY;       // gravel top at the centre, grid px
uniform float uNight;
uniform float uTime;
uniform float uTier;         // 1 full, 0 lean
uniform float uRipple;       // ripple strength, grid px
uniform float uPhase;        // 'alive' 1, 'dead' 0.35: dead water goes still
uniform vec2 uPointer;       // grid px, or (-1e4, -1e4)
uniform vec2 uParallax;      // grid px, the front plates' slide; the bg follows a third of it
uniform vec3 uTaps[4];       // taps on the glass: grid px x, y, and the clock time it happened (-1e4: none)
uniform float uWallAlpha;    // how much of the desk the water hides where there is only back wall (day)

// --- value noise (cheap, smooth) -----------------------------------------------------------------
float wpHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wpNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = wpHash(i);
  float b = wpHash(i + vec2(1.0, 0.0));
  float c = wpHash(i + vec2(0.0, 1.0));
  float d = wpHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// surface normal field, grid-px domain, returns (nx, ny) slope
vec2 wpRippleNormal(vec2 g, float t) {
  float s = 0.055;
  vec2 p = g * s;
  float e = 0.35;
  float h0 = wpNoise(p + vec2(t * 0.11, t * 0.07)) * 0.6 + wpNoise(p * 2.1 - vec2(t * 0.09, t * 0.13)) * 0.3 + wpNoise(p * 4.3 + vec2(0.0, t * 0.2)) * 0.1;
  float hx = wpNoise(p + vec2(e, 0.0) + vec2(t * 0.11, t * 0.07)) * 0.6 + wpNoise((p + vec2(e, 0.0)) * 2.1 - vec2(t * 0.09, t * 0.13)) * 0.3 + wpNoise((p + vec2(e, 0.0)) * 4.3 + vec2(0.0, t * 0.2)) * 0.1;
  float hy = wpNoise(p + vec2(0.0, e) + vec2(t * 0.11, t * 0.07)) * 0.6 + wpNoise((p + vec2(0.0, e)) * 2.1 - vec2(t * 0.09, t * 0.13)) * 0.3 + wpNoise((p + vec2(0.0, e)) * 4.3 + vec2(0.0, t * 0.2)) * 0.1;
  return vec2(hx - h0, hy - h0) / e;
}

// Wave trains on the surface, in the surface's own plane (grid x, and depth stretched out of the
// foreshortened band): three crossing trains of different length, speed and heading, so ripples are
// seen to TRAVEL across the water rather than shimmer in place. Returns the surface slope.
vec2 wpWaves(vec2 s, float t) {
  vec2 d1 = vec2(0.94, 0.34);
  vec2 d2 = vec2(-0.51, 0.86);
  vec2 d3 = vec2(0.20, -0.98);
  float a1 = dot(s, d1) * 0.42 - t * 1.5;
  float a2 = dot(s, d2) * 0.66 - t * 1.95;
  float a3 = dot(s, d3) * 1.05 - t * 2.6;
  return d1 * cos(a1) * 0.55 + d2 * cos(a2) * 0.32 + d3 * cos(a3) * 0.18;
}

// caustic web: two warped noise fields folded into bright threads. Not even: a slow field gathers the
// threads into brighter patches that drift (where the surface happens to focus the light), and the
// threads sharpen where it is bright and blur where it is not.
float wpCaustic(vec2 g, float t) {
  vec2 p = g * 0.075;
  vec2 w = vec2(wpNoise(p * 1.7 + vec2(t * 0.17, -t * 0.12)), wpNoise(p * 1.7 + vec2(-t * 0.14, t * 0.16) + 7.3));
  float a = wpNoise(p * 3.1 + w * 1.4 + vec2(t * 0.21, t * 0.1));
  float b = wpNoise(p * 2.6 - w * 1.1 + vec2(-t * 0.13, t * 0.19) + 3.1);
  float patchy = smoothstep(0.22, 0.82, wpNoise(g * 0.028 + vec2(t * 0.035, -t * 0.027)) * 0.7 + wpNoise(g * 0.06 - vec2(t * 0.05, 0.0)) * 0.3);
  float ridge = 1.0 - abs(a - b) * mix(1.5, 2.3, patchy);
  ridge = clamp(ridge, 0.0, 1.0);
  return pow(ridge, mix(2.2, 3.4, patchy)) * mix(0.3, 1.0, patchy);
}

// A tap on the glass: a ring that runs out from where you knocked, and fades.
vec2 wpTapRipple(vec2 g, float t, out float crest) {
  vec2 n = vec2(0.0);
  crest = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = t - uTaps[i].z;
    if (age < 0.0 || age > 2.4) continue;
    vec2 d = g - uTaps[i].xy;
    float r = length(d);
    float front = age * 48.0;
    float x = r - front;
    float env = exp(-x * x / 60.0) * exp(-age * 1.5) * smoothstep(0.0, 0.08, age);
    float w = sin(x * 0.75) * env;
    n += (d / max(r, 1e-3)) * w * 2.8;
    crest += max(w, 0.0);
  }
  return n;
}

void main() {
  // canvas -> grid px
  vec2 css = vec2(gl_FragCoord.x / uDpr, uCanvasCss.y - gl_FragCoord.y / uDpr);
  vec2 g = (css - vec2(uPad)) / uCssPerGrid;
  vec2 fishUv = vec2(gl_FragCoord.x, gl_FragCoord.y) / (uCanvasCss * uDpr);

  // --- coverage ------------------------------------------------------------------------------------
  // The water is clipped by the FRONT glass, which slides with the pointer parallax; so does every
  // edge computed here (rim, waterline, meniscus), or a sliver of water shows past the glass.
  vec2 gm = g - uParallax;
  vec2 dIn = (gm - uInner.xy) / uInner.zw;
  float e = dot(dIn, dIn);
  float inner = 1.0 - smoothstep(0.962, 1.0, e);
  float sx = (gm.x - uSurface.x) / uSurface.z;
  float sArg = clamp(1.0 - sx * sx, 0.0, 1.0);
  float halfH = uSurface.w * sqrt(sArg);
  float topEdge = uSurface.y - halfH;     // far edge of the surface, higher on screen
  float botEdge = uSurface.y + halfH;     // near edge, the waterline against the front glass
  float belowTop = smoothstep(topEdge - 0.6, topEdge + 0.6, gm.y);
  float mask = inner * belowTop;
  // in the surface band we look across the water surface; below it through the side glass
  float band = smoothstep(topEdge - 0.5, topEdge + 1.5, gm.y) * (1.0 - smoothstep(botEdge - 1.5, botEdge + 0.5, gm.y));
  float body = smoothstep(botEdge - 1.0, botEdge + 1.0, gm.y);

  vec4 fishHere = texture2D(uFish, fishUv);
  // Outside the water the near decor is still drawn by this pass (Pixi's copy is hidden), at its
  // plain parallax position, over whatever fin brushed the glass.
  if (mask < 0.002) {
    vec2 dUv0 = (g + uParallax) / uGrid;
    vec4 dOut = mix(texture2D(uDecor, dUv0), texture2D(uDecorNight, dUv0), uNight);
    gl_FragColor = vec4(dOut.rgb * dOut.a + fishHere.rgb * (1.0 - dOut.a), dOut.a + fishHere.a * (1.0 - dOut.a));
    return;
  }

  // --- refraction: a lens toward the centre plus moving ripples -------------------------------------
  vec2 n = wpRippleNormal(g + vec2(uTime * 1.5, 0.0), uTime) * uRipple * uPhase;
  // the surface's wave trains, seen through the side: the refraction they cause sweeps across too
  vec2 sPlane = vec2(g.x, (gm.y - uSurface.y) * uSurface.z / max(uSurface.w, 1.0));
  n += wpWaves(sPlane * 0.5, uTime) * 0.35 * uPhase;
  float tapCrest;
  n += wpTapRipple(gm, uTime, tapCrest);
  // the pointer at the glass: a standing dimple the water bends around
  vec2 toPtr = g - uPointer;
  float ptrD = length(toPtr);
  n += normalize(toPtr + 1e-4) * (1.0 - smoothstep(4.0, 22.0, ptrD)) * 0.9 * sin(ptrD * 0.9 - uTime * 6.0);
  // A water-filled sphere is a lens; an empty shell is not. The plates were rendered empty, so the
  // lens the water adds is applied here, to the plate, the decor and the fish alike, growing toward
  // the centre and vanishing at the glass so nothing tears at the rim.
  float mag = 1.0 + 0.14 * (1.0 - clamp(e, 0.0, 1.0)) * body;
  vec2 q = uInner.xy + uParallax + (gm - uInner.xy) / mag + n * (0.6 + 0.4 * body);
  // the plates slide with the pointer parallax; the refracted bg follows a third of it so the
  // water reads as a thick thing between front and back glass rather than a flat sheet
  vec2 bgUv = (q + uParallax * 0.33) / uGrid;
  vec4 bg = mix(texture2D(uBg, bgUv), texture2D(uBgNight, bgUv), uNight);
  vec2 dUv = (q + uParallax) / uGrid;
  vec4 decor = mix(texture2D(uDecor, dUv), texture2D(uDecorNight, dUv), uNight);
  vec2 fishQ = (vec2(uPad) + q * uCssPerGrid);
  vec2 fishUvQ = vec2(fishQ.x, uCanvasCss.y - fishQ.y) / uCanvasCss;
  vec4 fish = texture2D(uFish, fishUvQ);
  // The contents mask, ERODED by a grid px. The plate's things were anti-aliased against the dark
  // back wall, so their outermost pixels are a dark fringe; cutting a hair inside the silhouette
  // hands that fringe to the water instead of drawing it as an outline.
  vec2 mpx = vec2(0.8) / uGrid;
  float cm = texture2D(uContents, bgUv).r;
  cm = min(cm, texture2D(uContents, bgUv + vec2(mpx.x, 0.0)).r);
  cm = min(cm, texture2D(uContents, bgUv - vec2(mpx.x, 0.0)).r);
  cm = min(cm, texture2D(uContents, bgUv + vec2(0.0, mpx.y)).r);
  cm = min(cm, texture2D(uContents, bgUv - vec2(0.0, mpx.y)).r);
  float plateW = smoothstep(0.35, 0.85, cm) * bg.a;

  // --- the water body: depth tint, absorption, a lit back wall --------------------------------------
  float depth = clamp((gm.y - botEdge) / max(uFloorY + 22.0 - botEdge, 1.0), 0.0, 1.0);
  float toEdge = clamp(e, 0.0, 1.0);
  vec3 dayDeep = vec3(0.12, 0.42, 0.56);
  vec3 dayShallow = vec3(0.42, 0.76, 0.86);
  vec3 nightDeep = vec3(0.04, 0.10, 0.24);
  vec3 nightShallow = vec3(0.14, 0.30, 0.52);
  vec3 deep = mix(dayDeep, nightDeep, uNight);
  vec3 shallow = mix(dayShallow, nightShallow, uNight);
  vec3 waterCol = mix(shallow, deep, depth * 0.7 + toEdge * 0.3);
  // transmittance of the water column in front of a thing: reds go first, but a bowl is small
  vec3 absorb = exp(-vec3(0.8, 0.32, 0.1) * (0.1 + 0.4 * depth + 0.25 * toEdge));
  // The back wall: water lit from above, brighter where the light enters, with the faint ghost of
  // the gravel the inside of the glass still reflects (weakly now: glass against water, not air).
  float lum = dot(bg.rgb, vec3(0.3, 0.5, 0.2));
  vec3 wall = waterCol * (1.1 + 0.35 * (1.0 - depth) * (1.0 - toEdge)) + bg.rgb * 0.10 * bg.a;
  wall += vec3(0.9, 1.0, 1.0) * lum * 0.05;
  vec3 col = mix(wall, bg.rgb * absorb, plateW);
  // in-scatter: the water itself glows where light enters at the top
  col += waterCol * (0.06 + 0.22 * (1.0 - depth)) * (1.0 - 0.6 * uNight) * (1.0 - 0.5 * plateW);
  // light shafts, slow, only in the upper body
  float shaft = wpNoise(vec2(g.x * 0.09 + uTime * 0.05, g.y * 0.012 - uTime * 0.02));
  shaft = smoothstep(0.55, 0.85, shaft) * (1.0 - depth) * body;
  col += vec3(0.55, 0.75, 0.85) * shaft * 0.10 * (1.0 - 0.75 * uNight) * uTier;
  // light from the rippling surface moving down through the water: soft bands that travel with the waves
  vec2 wv = wpWaves(vec2(g.x, g.y * 0.35) * 0.5, uTime);
  float shimmer = smoothstep(0.15, 0.6, wv.x * 0.8 + wv.y * 0.6) * (1.0 - depth) * body;
  col += vec3(0.7, 0.9, 1.0) * shimmer * 0.06 * (1.0 - 0.7 * uNight) * uPhase;

  // --- caustics on the gravel -----------------------------------------------------------------------
  // Only on the BED: the band from the back of the gravel down to just past its near lip. Below
  // that the plate is the outside of the dish, which no light from the surface reaches.
  float gravelBand = smoothstep(uFloorY - 24.0, uFloorY - 6.0, gm.y) * (1.0 - smoothstep(uFloorY + 4.0, uFloorY + 16.0, gm.y)) * inner;
  float caus = wpCaustic(q, uTime * uPhase + 11.0);
  vec3 causCol = mix(vec3(0.95, 1.0, 0.85), vec3(0.45, 0.6, 1.0), uNight);
  vec3 causAdd = causCol * caus * gravelBand * mix(0.16, 0.07, uNight) * (0.5 + 0.5 * uTier);
  col += causAdd * plateW;

  // --- the fish, inside the water: refracted with the plate, tinted by its depth --------------------
  vec3 fishTint = mix(vec3(1.0), absorb * 1.4 + 0.4, 0.3);
  col = fish.rgb * fishTint + col * (1.0 - fish.a);

  // --- the near decor, in front of the fish, with less water in front of it --------------------------
  vec3 absorbNear = exp(-vec3(0.9, 0.36, 0.12) * (0.06 + 0.25 * depth));
  col = (decor.rgb * absorbNear + causAdd * 0.6) * decor.a + col * (1.0 - decor.a);

  // --- the glass/water edge: a Fresnel-bright rim, and the surface band ------------------------------
  float rim = smoothstep(0.80, 1.0, e) * 0.14 * (1.0 - 0.5 * uNight);
  col += vec3(0.75, 0.9, 1.0) * rim;
  // the surface seen across: the room reflected, sharper ripples, a bright meniscus at the near edge
  vec2 ns = wpRippleNormal(g * 1.8 + vec2(uTime * 2.2, 0.0), uTime * 1.4) * uPhase * 0.6;
  // the trains, in the surface plane, warped a little so their crests wander instead of ruling lines
  vec2 warp = vec2(wpNoise(sPlane * 0.035 + uTime * 0.05), wpNoise(sPlane * 0.035 - uTime * 0.04 + 4.1)) - 0.5;
  vec2 wsl = wpWaves(sPlane * 0.32 + warp * 9.0, uTime) * uPhase;
  ns += wsl * 0.7;
  float tapC2;
  ns += wpTapRipple(gm, uTime, tapC2) * 0.25;
  vec3 N = normalize(vec3(ns.x * 0.9, 1.0, ns.y * 0.9));
  vec3 L = normalize(vec3(-0.35, 1.0, 0.55));
  vec3 V = vec3(0.0, 0.16, 0.99);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 70.0) + 0.5 * pow(max(dot(N, H), 0.0), 12.0);
  vec3 skyCol = mix(vec3(0.80, 0.90, 0.97), vec3(0.18, 0.24, 0.42), uNight);
  float bandT = clamp((gm.y - topEdge) / max(botEdge - topEdge, 1.0), 0.0, 1.0);
  // the room reflected in the surface, strongest at the far edge, with ripple-broken glints
  float fres = 0.12 + 0.28 * (1.0 - bandT);
  // the reflection brightens on the faces of the waves that tilt toward the window and darkens on the
  // backs: the bands you see running across a real bowl's surface
  float tilt = clamp(0.5 + 0.9 * dot(wsl, vec2(-0.35, 0.55)), 0.0, 1.0);
  col = mix(col, skyCol * (0.62 + 0.76 * tilt), band * fres * (0.75 + 0.7 * tilt));
  col += vec3(1.0, 0.98, 0.92) * spec * band * mix(1.1, 0.5, uNight);
  // broad glints riding the wave faces that catch the light: what the eye follows across a surface
  float glint = smoothstep(0.62, 0.95, tilt) * smoothstep(0.3, 0.7, wpNoise(sPlane * 0.09 + vec2(uTime * 0.3, 0.0)));
  col += vec3(1.0, 0.99, 0.95) * glint * band * mix(0.22, 0.10, uNight);
  // and the shadowed backs, a touch darker, so the bands have two sides
  col *= 1.0 - band * smoothstep(0.35, 0.05, tilt) * 0.10;
  // the meniscus: a bright line where the water meets the front glass, a thin shadow under it
  float meniscus = exp(-pow((gm.y - botEdge) / 0.75, 2.0)) * inner * smoothstep(0.05, 0.4, sArg);
  col += mix(vec3(0.92, 0.98, 1.0), vec3(0.45, 0.6, 0.9), uNight) * meniscus * 0.8;
  float underline = exp(-pow((gm.y - botEdge - 1.4) / 0.7, 2.0)) * inner * smoothstep(0.05, 0.4, sArg);
  col *= 1.0 - 0.22 * underline;
  float farLine = exp(-pow((gm.y - topEdge) / 0.7, 2.0)) * inner;
  col += skyCol * farLine * 0.3;
  col += vec3(0.75, 0.92, 1.0) * tapCrest * 0.24;

  // --- how much of the desk shows through ---------------------------------------------------------
  // Only where the water has nothing behind it but the back wall: the gravel, the plants, the fish
  // and the surface (which reflects the room) stay solid. More water in the line of sight (deeper,
  // nearer the glass's edge) hides more. Premultiplied, so the plate under it is not counted twice.
  float wallA = mix(uWallAlpha, min(1.0, uWallAlpha + 0.18), clamp(depth * 0.6 + toEdge * 0.5, 0.0, 1.0));
  wallA = mix(wallA, min(1.0, wallA + 0.12), uNight);
  float solid = max(max(plateW, fish.a), max(decor.a, band * 0.85 + meniscus));
  float a = mix(wallA, 1.0, clamp(solid, 0.0, 1.0));
  vec4 water = vec4(col * a, a);
  gl_FragColor = mix(fishHere, water, mask);
}
`;
