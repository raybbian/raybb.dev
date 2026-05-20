#version 300 es
precision mediump float;
// Mask bake (one of two W4 passes). Outputs the max-of-foam-or-crest scalar
// for this ripple's coverage. The FBO uses MAX blending so overlapping
// ripples take the brighter contribution (mirrors the
// `mask = max(mask, ...)` in the old per-pixel water composite loop).
in vec2 v_local;            // world-px offset from ripple center
flat in vec4 v_a;           // (cx, cy, radius, rot)
flat in vec4 v_b;           // (notch, amp, foam, seed)
// u_noise + wn_foamWidthNoise / wn_crestWidthNoise live here:
#include "waterNoise.glsl"
uniform float u_time;
uniform float u_scale;
out float o_mask;

const float RIPPLE_BAND = 50.0;
const float RIPPLE_FADE = 18.0;
const float RIPPLE_WAVELEN = 42.0;
const float RIPPLE_SPEED = 0.25;
const float RING_W_PX = 4.0;
const float RING_W_VAR = 3.0;
const float RING_AA_PX = 0.25;
const float WIDTH_RADIAL = 0.012;
const float FOAM_PX = 10.0;
// Foam-collar width variation: ±2.5 px around FOAM_PX gives a foam band
// of ~7.5–12.5 px — enough to break up the rim without making the collar
// thickness obviously swing.
const float FOAM_VAR = 2.5;

// Same SDF the water composite used to call per-ripple per-pixel. Notch=0
// degenerates to a plain disk (lotuses).
float sdRippleSource(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

float crestRing(float pd, float wl, vec2 nd, float seed, float phaseOff) {
  float w = wn_crestWidthNoise(nd, seed, pd / u_scale, WIDTH_RADIAL, u_time);
  float halfW = (RING_W_PX + (w - 0.5) * 2.0 * RING_W_VAR) * u_scale;
  float cyc = fract(pd / wl - u_time * RIPPLE_SPEED + phaseOff);
  float dn = min(cyc, 1.0 - cyc) * wl;
  float aa = RING_AA_PX * u_scale;
  return 1.0 - smoothstep(halfW - aa, halfW + aa, dn);
}

void main() {
  vec2 d = v_local;
  float dist = length(d);
  if (dist < 1e-3) discard;
  vec2 nd = d / dist;

  float radius = v_a.z;
  float rot = v_a.w;
  float notch = v_b.x;
  float amp = v_b.y;
  float foamFlag = v_b.z;
  float seed = v_b.w;

  float pd = sdRippleSource(d, radius, rot, notch);
  float band = RIPPLE_BAND * u_scale;
  // Discard everything outside the active band; the MAX blend then keeps
  // whatever the FBO already had at that texel.
  if (pd <= 0.0 || pd >= band) discard;

  // Static foam collar pinned to the rim — gated off for dynamic ripples.
  float fwn = wn_foamWidthNoise(nd, seed, u_time);
  float fw = (FOAM_PX + (fwn - 0.5) * 2.0 * FOAM_VAR) * u_scale;
  float aa = RING_AA_PX * u_scale;
  float foam = 1.0 - smoothstep(fw - aa, fw + aa, pd);

  // Travelling crest ring with edge fade.
  float fade = RIPPLE_FADE * u_scale;
  float edgeFade = 1.0 - smoothstep(band - fade, band, pd);
  float wavelen = RIPPLE_WAVELEN * u_scale;
  float ring = crestRing(pd, wavelen, nd, seed, seed) * edgeFade;

  o_mask = max(foam * amp * foamFlag, ring * amp);
}
