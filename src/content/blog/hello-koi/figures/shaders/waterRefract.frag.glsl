#version 300 es
precision mediump float;
// "Unoptimized" water shader figure: evaluates time-based FBM per pixel,
// same as the production water shader did before the noise bake.
//   - ambient refraction: n_displacement (FBM-difference vector field)
//   - foam-width variation: n_fbm
//   - crest-ring width variation: n_fbm
// The baked-noise figure that follows shows the same scene with the FBM
// replaced by a texture lookup — visually indistinguishable, dramatically
// cheaper. Constants kept aligned with production water tuning.
#include "../../../../../render/shaders/noise.glsl"
in vec2 v_uv;
uniform sampler2D u_scene;  // offscreen capture of the single lilypad
uniform vec2 u_res;         // panel size, px (logical)
uniform float u_time;
// One foam/ripple source: cx, cy, radius, rot (notch + seed alongside).
uniform vec4 u_lily;
uniform float u_lilyNotch;
uniform float u_lilySeed;
// Pond palette + tint factors, pushed from TS — same single source as the
// production WaterRenderer / water.frag.glsl (BG_DARK in frame.ts, DEEP_DARK /
// SHEEN / RIPPLE_CREST in WaterRenderer.ts).
uniform vec3 u_bg;
uniform vec3 u_deep;
uniform float u_sheen;
uniform float u_rippleCrest;
out vec4 o;

// FBM lattice frequencies + time-scroll rates, the values production used
// before the bake.
const float REFRACT_FREQ = 3.0;
const float REFRACT_SPEED = 0.15;
// Stronger than production's REFRACT_PX so the FBM-driven wobble reads
// clearly in the figure — this is the "before optimization" snapshot, and
// readers should see exactly how much per-pixel displacement the FBM
// produces. The baked-noise figure that follows is calibrated to the
// production level.
const float REFRACT_STRENGTH = 6.0;
const float FOAM_FREQ = 4.0;
const float FOAM_SPEED = 0.5;
const float WIDTH_FREQ = 2.2;
const float WIDTH_SPEED = 0.2;
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
const float AA_PX = 1.0;

// The "two-color rectangle under the water": a striped tile filling most of
// the panel with vertical bands in alternating colours. The lily floats above
// it; the water shader refracts everything sampled from below.
const vec2 RECT_LO = vec2(0.06, 0.12);
const vec2 RECT_HI = vec2(0.94, 0.88);
const float STRIPE_PERIOD_PX = 64.0;
const vec3 STRIPE_A = vec3(0.93, 0.85, 0.62); // warm cream
const vec3 STRIPE_B = vec3(0.16, 0.36, 0.34); // dark teal stripe

float sdNotched(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

float crestRing(float pd, vec2 nd, float seed) {
  // 3-octave FBM evaluated PER PIXEL — the cost the bake eliminates.
  float w = n_fbm(nd * WIDTH_FREQ
                  + vec2(seed + pd * WIDTH_RADIAL, u_time * WIDTH_SPEED), 3);
  float halfW = RING_W_PX + (w - 0.5) * 2.0 * RING_W_VAR;
  float cyc = fract(pd / RIPPLE_WAVELEN - u_time * RIPPLE_SPEED + seed);
  float dn = min(cyc, 1.0 - cyc) * RIPPLE_WAVELEN;
  return 1.0 - smoothstep(halfW - RING_AA_PX, halfW + RING_AA_PX, dn);
}

// Striped rectangle at the given uv. .a == 1 inside the rect, 0 outside.
vec4 sampleStripes(vec2 uv) {
  vec2 e = step(RECT_LO, uv) - step(RECT_HI, uv);
  float inside = e.x * e.y;
  float t = uv.x * u_res.x / STRIPE_PERIOD_PX;
  float band = step(0.5, fract(t));
  return vec4(mix(STRIPE_A, STRIPE_B, band), inside);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  // Ambient displacement: time-based FBM difference, the literal expression
  // the production water shader used to evaluate every frame.
  vec2 nuv = px / u_res.y * REFRACT_FREQ;
  vec2 offsetPx = n_displacement(nuv, u_time * REFRACT_SPEED) * REFRACT_STRENGTH;

  // Lily ripple: sinusoidal radial push + travelling crest ring + static foam
  // collar. Only contributes for pixels outside the lily disk and within the
  // ripple band.
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
    // Foam-width variation: another 3-octave FBM evaluation per pixel.
    float fw = FOAM_PX
             + (n_fbm(nd * FOAM_FREQ + vec2(u_lilySeed, u_time * FOAM_SPEED), 3) - 0.5)
               * 2.0 * FOAM_VAR;
    foam = 1.0 - smoothstep(fw - AA_PX, fw + AA_PX, pd);
    ring = crestRing(pd, nd, u_lilySeed) * edgeFade;
  }

  // Sample the underwater layer (the striped rectangle) at the displaced uv —
  // this is what gives the stripes their wobble under the lily's ripple.
  vec2 uvR = v_uv + offsetPx / u_res;
  vec4 stripes = sampleStripes(uvR);

  // The lily FLOATS on the water — it isn't below it — so sample its
  // silhouette at the unrefracted uv. Refracting it would make the pad read as
  // "submerged", which is the inverse of what's actually happening.
  vec4 lily = texture(u_scene, v_uv);

  // Bottom-up composite. Water bg -> refracted stripes (in rect) ->
  // mix(everything-so-far, deep, sheen) -> foam + crest in WATER only ->
  // lily silhouette on top.
  vec3 col = u_bg;
  col = mix(col, stripes.rgb, stripes.a);
  col = mix(col, u_deep, u_sheen);
  float waterMask = 1.0 - lily.a;
  col += max(foam, ring) * waterMask * u_rippleCrest;
  col = mix(col, lily.rgb, lily.a);

  o = vec4(col, 1.0);
}
