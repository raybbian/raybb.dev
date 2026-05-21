// Foam + crest-ring math shared by the wiper figures (flat-vs-toon,
// shadows-on-off). Same tunables, same uniforms, same sampling helpers as
// production rippleMask.frag.glsl reads — figures stay frame-identical to
// the production water shader. `u_time` is declared by the including shader.
#include "waterNoise.glsl"

const int MAX_DISKS = 5;
uniform int u_diskCount;
uniform vec4 u_disks[MAX_DISKS];  // cx, cy, radius, rot (rot used by notched lily)
uniform float u_notch[MAX_DISKS]; // 0 = plain, >0 = half-angle of wedge
uniform float u_seed[MAX_DISKS];

const float FFR_FOAM_PX = 10.0;
const float FFR_FOAM_VAR = 2.5;
const float FFR_RING_W_PX = 4.0;
const float FFR_RING_W_VAR = 3.0;
const float FFR_WIDTH_RADIAL = 0.012;
const float FFR_RING_AA_PX = 0.4;
const float FFR_RIPPLE_WAVELEN = 42.0;
const float FFR_RIPPLE_BAND = 50.0;
const float FFR_RIPPLE_FADE = 18.0;
const float FFR_RIPPLE_SPEED = 0.25;
const float FFR_AA_PX = 1.0;

float ffr_sdNotched(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

float ffr_crestRing(float pd, vec2 nd, float seed, float time) {
  float w = wn_crestWidthNoise(nd, seed, pd, FFR_WIDTH_RADIAL, time);
  float halfW = FFR_RING_W_PX + (w - 0.5) * 2.0 * FFR_RING_W_VAR;
  float cyc = fract(pd / FFR_RIPPLE_WAVELEN - time * FFR_RIPPLE_SPEED + seed);
  float dn = min(cyc, 1.0 - cyc) * FFR_RIPPLE_WAVELEN;
  return 1.0 - smoothstep(halfW - FFR_RING_AA_PX, halfW + FFR_RING_AA_PX, dn);
}

void computeFoamRing(vec2 px, float time, out float foam, out float ring) {
  foam = 0.0;
  ring = 0.0;
  for (int i = 0; i < MAX_DISKS; i++) {
    if (i >= u_diskCount) break;
    vec4 dk = u_disks[i];
    vec2 d = px - dk.xy;
    float pd = ffr_sdNotched(d, dk.z, dk.w, u_notch[i]);
    if (pd <= 0.0 || pd >= FFR_RIPPLE_BAND) continue;
    vec2 nd = d / max(length(d), 1e-3);
    float seed = u_seed[i];
    float edgeFade = 1.0 - smoothstep(FFR_RIPPLE_BAND - FFR_RIPPLE_FADE, FFR_RIPPLE_BAND, pd);
    float fwn = wn_foamWidthNoise(nd, seed, time);
    float fw = FFR_FOAM_PX + (fwn - 0.5) * 2.0 * FFR_FOAM_VAR;
    foam = max(foam, 1.0 - smoothstep(fw - FFR_AA_PX, fw + FFR_AA_PX, pd));
    ring = max(ring, ffr_crestRing(pd, nd, seed, time) * edgeFade);
  }
}
