#version 300 es
precision mediump float;
// Foam + crest sampling helpers shared with production (waterNoise.glsl);
// the figure reads exactly the same baked noise field the production
// rippleMask.frag.glsl reads.
#include "../../../../../render/shaders/waterNoise.glsl"
in vec2 v_uv;
uniform sampler2D u_scene;  // offscreen FBO with the lily + lotus on transparent bg
uniform vec2 u_res;         // panel size, px (logical)
uniform float u_time;
uniform float u_wiper;      // wiper x position in [0,1]
// Water colour + tint factors, pushed from TS — same single source as the
// production WaterRenderer / water.frag.glsl (BG_DARK in frame.ts, DEEP_DARK /
// SHEEN / RIPPLE_CREST in WaterRenderer.ts).
uniform vec3 u_bg;          // scene clear / water base
uniform vec3 u_deep;        // sheen tint target
uniform float u_sheen;      // mix(bg, deep, sheen) gives the toon water tone
uniform float u_rippleCrest;// brightness boost added by foam + ring mask

// Foam + ripple sources. The figure lays out a randomized scene of 3 lilies
// + 2 lotuses; lilies have a notch wedge, lotuses are plain disks pinned at
// the bloom's ripple radius (RIPPLE_RADIUS_FRAC * reach).
const int MAX_DISKS = 5;
uniform int u_diskCount;
uniform vec4 u_disks[MAX_DISKS];   // cx, cy, radius, rot (rot only used by the notched disk)
uniform float u_notch[MAX_DISKS];  // 0 = plain, >0 = half-angle of wedge
uniform float u_seed[MAX_DISKS];

out vec4 o;

// Per-source ripple/foam tunables. Match production rippleMask.frag.glsl's
// values so the figure reproduces the same field; UV scales + scroll rates
// live in waterNoise.glsl (single source of truth, no chance of drifting).
const float FOAM_PX = 10.0;
const float FOAM_VAR = 2.5;
const float RING_W_PX = 4.0;
const float RING_W_VAR = 3.0;
const float WIDTH_RADIAL = 0.012;
const float RING_AA_PX = 0.4;
const float RIPPLE_WAVELEN = 42.0;
const float RIPPLE_BAND = 50.0;
const float RIPPLE_FADE = 18.0;
const float RIPPLE_SPEED = 0.25;
const float AA_PX = 1.0;
const float HANDLE_LINE_PX = 2.0;
const float HANDLE_DOT_R_PX = 8.0;

// Bar is plain white; the grab dot is the figure palette's accent teal,
// pushed in as u_handleDot so the colour stays in lockstep with PALETTE.
const vec3 HANDLE_BAR = vec3(1.0, 1.0, 1.0);
uniform vec3 u_handleDot;

float sdNotched(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

// Travelling crest ring (production rippleMask.frag.glsl crestRing): one
// bright band riding the cyclic phase outward, width decorrelated per ring
// by a shared baked-noise lookup instead of an FBM loop.
float crestRing(float pd, vec2 nd, float seed) {
  float w = wn_crestWidthNoise(nd, seed, pd, WIDTH_RADIAL, u_time);
  float halfW = RING_W_PX + (w - 0.5) * 2.0 * RING_W_VAR;
  float cyc = fract(pd / RIPPLE_WAVELEN - u_time * RIPPLE_SPEED + seed);
  float dn = min(cyc, 1.0 - cyc) * RIPPLE_WAVELEN;
  return 1.0 - smoothstep(halfW - RING_AA_PX, halfW + RING_AA_PX, dn);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  // Scene texture: the lily + lotus rendered on transparent bg. Sampled at the
  // unrefracted uv on BOTH sides — neither flower sits below the water.
  vec4 scene = texture(u_scene, v_uv);

  // FLAT SIDE — just the bare clear colour the production scene starts at,
  // with the lily/lotus composited on top. No SHEEN, no foam, no ripples.
  vec3 flatCol = mix(u_bg, scene.rgb, scene.a);

  // TOON SIDE — production formula: scene colour mixed toward u_deep by
  // u_sheen, then foam + ring added as a brightness boost in water pixels.
  // u_sheen tints the lily/lotus too, matching the prod water shader's
  // behaviour where the whole sample passes through the mix.
  vec3 toonCol = mix(u_bg, scene.rgb, scene.a);
  toonCol = mix(toonCol, u_deep, u_sheen);

  float foam = 0.0;
  float ring = 0.0;
  for (int i = 0; i < MAX_DISKS; i++) {
    if (i >= u_diskCount) break;
    vec4 dk = u_disks[i];
    vec2 d = px - dk.xy;
    float pd = sdNotched(d, dk.z, dk.w, u_notch[i]);
    if (pd <= 0.0 || pd >= RIPPLE_BAND) continue;
    vec2 nd = d / max(length(d), 1e-3);
    float seed = u_seed[i];
    float edgeFade = 1.0 - smoothstep(RIPPLE_BAND - RIPPLE_FADE, RIPPLE_BAND, pd);
    // Foam-width variation: shared baked noise sample, identical to prod.
    float fwn = wn_foamWidthNoise(nd, seed, u_time);
    float fw = FOAM_PX + (fwn - 0.5) * 2.0 * FOAM_VAR;
    foam = max(foam, 1.0 - smoothstep(fw - AA_PX, fw + AA_PX, pd));
    ring = max(ring, crestRing(pd, nd, seed) * edgeFade);
  }
  float waterMask = 1.0 - scene.a;
  toonCol += max(foam, ring) * waterMask * u_rippleCrest;

  // Wiper composite.
  float wiperPx = u_wiper * u_res.x;
  float wiperT = smoothstep(wiperPx - AA_PX, wiperPx + AA_PX, px.x);
  vec3 col = mix(flatCol, toonCol, wiperT);

  // Wiper handle: white bar spanning the panel + a teal grab dot centred
  // vertically on the line. Two colours so the dot reads as the affordance
  // while the bar stays a neutral divider.
  float lineDx = abs(px.x - wiperPx);
  float lineMask = 1.0 - smoothstep(HANDLE_LINE_PX, HANDLE_LINE_PX + AA_PX, lineDx);
  col = mix(col, HANDLE_BAR, lineMask * 0.85);
  float dh = length(px - vec2(wiperPx, u_res.y * 0.5));
  float handleMask = 1.0 - smoothstep(HANDLE_DOT_R_PX, HANDLE_DOT_R_PX + AA_PX, dh);
  col = mix(col, u_handleDot, handleMask);

  o = vec4(col, 1.0);
}
