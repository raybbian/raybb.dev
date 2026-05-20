#version 300 es
precision mediump float;
// Wiper figure: drags between two views of the SAME baked noise texture
// production samples for ambient water refraction.
//   left  side  the water shader's output — stripes under the pond plus
//               a lilypad with its ripple band + foam collar + crest ring.
//               All three effects (ambient refract, foam-width variation,
//               crest-width variation) sample the same baked texture
//               wn_refractOffset / wn_foamWidthNoise / wn_crestWidthNoise
//               point at — there's no per-pixel FBM here.
//   right side  the noise texture itself — R, G channels visualized as
//               colour, sampled at the SAME px/u_res.y scale wn_refractOffset
//               uses so a feature on the noise side lines up 1:1 with the
//               ambient refraction it produces on the water side.
#include "../../../../../render/shaders/waterNoise.glsl"
in vec2 v_uv;
uniform sampler2D u_scene;  // offscreen capture of the single lilypad
uniform vec2 u_res;
uniform float u_time;
uniform float u_wiper;
// One foam/ripple source: cx, cy, radius, rot (notch + seed alongside).
// Same layout as the waterRefract figure so the lily reads as the same
// scene of water.
uniform vec4 u_lily;
uniform float u_lilyNotch;
uniform float u_lilySeed;
// Pond palette pushed from TS so the figure matches whatever theme the
// page is in (same BG_DARK/LIGHT + DEEP_DARK/LIGHT the WaterRenderer uses).
uniform vec3 u_bg;
uniform vec3 u_deep;
uniform float u_sheen;
uniform float u_rippleCrest;
uniform vec3 u_handleDot;
out vec4 o;

// Subtle ambient drift; same value the waterRefract figure uses so they
// read as the same scene of water.
const float REFRACT_STRENGTH = 3.0;
// Ripple/foam tunables — match waterRefract.frag.glsl and the production
// rippleMask.frag.glsl so the lily creates the same band shape.
const float FOAM_PX = 10.0;
const float FOAM_VAR = 2.5;
const float RING_W_PX = 4.0;
const float RING_W_VAR = 3.0;
const float WIDTH_RADIAL = 0.012;
const float RING_AA_PX = 0.4;
const float RIPPLE_WAVELEN = 42.0;
const float RIPPLE_BAND = 50.0;
const float RIPPLE_FADE = 18.0;
const float RIPPLE_PUSH = 2.5;
const float RIPPLE_SPEED = 0.25;

// Striped tile that lives "under" the water (figure-only, mirrors the
// rectangle used in the waterRefract figure for visual consistency).
const vec2 RECT_LO = vec2(0.06, 0.12);
const vec2 RECT_HI = vec2(0.94, 0.88);
const float STRIPE_PERIOD_PX = 64.0;
const vec3 STRIPE_A = vec3(0.93, 0.85, 0.62); // warm cream
const vec3 STRIPE_B = vec3(0.16, 0.36, 0.34); // dark teal stripe

const float AA_PX = 1.0;
const float HANDLE_LINE_PX = 2.0;
const float HANDLE_DOT_R_PX = 8.0;
const vec3 HANDLE_BAR = vec3(1.0, 1.0, 1.0);

float sdNotched(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

float crestRing(float pd, vec2 nd, float seed) {
  float w = wn_crestWidthNoise(nd, seed, pd, WIDTH_RADIAL, u_time);
  float halfW = RING_W_PX + (w - 0.5) * 2.0 * RING_W_VAR;
  float cyc = fract(pd / RIPPLE_WAVELEN - u_time * RIPPLE_SPEED + seed);
  float dn = min(cyc, 1.0 - cyc) * RIPPLE_WAVELEN;
  return 1.0 - smoothstep(halfW - RING_AA_PX, halfW + RING_AA_PX, dn);
}

vec4 sampleStripes(vec2 uv) {
  vec2 e = step(RECT_LO, uv) - step(RECT_HI, uv);
  float inside = e.x * e.y;
  float t = uv.x * u_res.x / STRIPE_PERIOD_PX;
  float band = step(0.5, fract(t));
  return vec4(mix(STRIPE_A, STRIPE_B, band), inside);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  // ===== WATER SIDE — ambient refraction + the lily's own ripple band.
  // wn_refractOffset reads the baked noise at px/u_res.y *
  // WN_REFRACT_NOISE_SCALE with WN_REFRACT_SCROLL time animation; this is
  // the same call production water.frag.glsl makes.
  vec2 offsetPx = wn_refractOffset(px, u_res, u_time, REFRACT_STRENGTH);

  // Lily ripple: radial push + travelling crest + static foam collar, all
  // gated to the band outside the lily disk. Width variation comes from
  // the shared wn_*WidthNoise helpers so the foam and crest sample the
  // exact texture displayed on the right side.
  vec2 d = px - u_lily.xy;
  float pd = sdNotched(d, u_lily.z, u_lily.w, u_lilyNotch);
  vec2 nd = d / max(length(d), 1e-3);
  float foam = 0.0;
  float ring = 0.0;
  if (pd > 0.0 && pd < RIPPLE_BAND) {
    float edgeFade = 1.0 - smoothstep(RIPPLE_BAND - RIPPLE_FADE, RIPPLE_BAND, pd);
    offsetPx += nd
              * sin((pd / RIPPLE_WAVELEN - u_time * RIPPLE_SPEED + u_lilySeed) * 6.2831853)
              * RIPPLE_PUSH * edgeFade;
    float fwn = wn_foamWidthNoise(nd, u_lilySeed, u_time);
    float fw = FOAM_PX + (fwn - 0.5) * 2.0 * FOAM_VAR;
    foam = 1.0 - smoothstep(fw - AA_PX, fw + AA_PX, pd);
    ring = crestRing(pd, nd, u_lilySeed) * edgeFade;
  }

  // Bottom-up composite, mirroring waterRefract.frag.glsl.
  vec2 uvR = v_uv + offsetPx / u_res;
  vec4 stripes = sampleStripes(uvR);
  vec4 lily = texture(u_scene, v_uv); // lily floats, sampled at unrefracted uv
  vec3 waterCol = u_bg;
  waterCol = mix(waterCol, stripes.rgb, stripes.a);
  waterCol = mix(waterCol, u_deep, u_sheen);
  float waterMask = 1.0 - lily.a;
  waterCol += max(foam, ring) * waterMask * u_rippleCrest;
  waterCol = mix(waterCol, lily.rgb, lily.a);

  // ===== NOISE SIDE — same texture, same UV (so the wiper boundary lines
  // up: a yellow spot in the noise produces stripes shifting right on the
  // water side directly across the wiper). Built inline rather than
  // through a helper because the helper hides the colour we want to see.
  vec2 nuv = px / u_res.y * WN_REFRACT_NOISE_SCALE
           + vec2(u_time * WN_REFRACT_SCROLL, u_time * WN_REFRACT_SCROLL * 0.7);
  vec3 noiseCol = vec3(texture(u_noise, nuv).rg, 0.0);
  // Lattice grid at each texture-period boundary so the reader sees the
  // tileable unit. One period = 8 base-octave noise cells.
  vec2 g = abs(fract(nuv) - 0.5);
  vec2 gw = fwidth(nuv);
  float line = min(g.x / gw.x, g.y / gw.y);
  float lineMask = (1.0 - smoothstep(0.4, 1.0, line)) * 0.18;
  noiseCol = mix(noiseCol, vec3(0.58, 0.64, 0.72), lineMask);

  // ===== WIPER COMPOSITE
  float wiperPx = u_wiper * u_res.x;
  float wiperT = smoothstep(wiperPx - AA_PX, wiperPx + AA_PX, px.x);
  vec3 col = mix(waterCol, noiseCol, wiperT);

  // Wiper handle: same white bar + accent-coloured grab dot pattern as
  // the flatVsToon figure so the two read as a matched pair.
  float lineDx = abs(px.x - wiperPx);
  float bar = 1.0 - smoothstep(HANDLE_LINE_PX, HANDLE_LINE_PX + AA_PX, lineDx);
  col = mix(col, HANDLE_BAR, bar * 0.85);
  float dh = length(px - vec2(wiperPx, u_res.y * 0.5));
  float dot = 1.0 - smoothstep(HANDLE_DOT_R_PX, HANDLE_DOT_R_PX + AA_PX, dh);
  col = mix(col, u_handleDot, dot);

  o = vec4(col, 1.0);
}
