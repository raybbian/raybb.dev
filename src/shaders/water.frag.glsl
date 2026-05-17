#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_refract;  // low-res ambient displacement (RG = disp*.5+.5)
uniform highp vec2 u_res; // highp: shadow sample coord + fwidth AA need it
uniform float u_time;
uniform vec3 u_deep;       // deep-water tint target
uniform int u_rippleCount;
uniform vec4 u_ripples[MAX_RIPPLES];      // cx, cy, radius, rot (px / rad)
uniform float u_rippleNotch[MAX_RIPPLES]; // V-notch half-angle, rad
uniform float u_rippleAmp[MAX_RIPPLES];   // 0..1 strength (1 = pads/lotuses)
uniform sampler2D u_fishDepth;      // R = fish submergence, 0 = open water
#include "shadow.glsl"
out vec4 o;

// --- Tunable knobs (single place to retune the water feel) -----------------
const float REFRACT_PX = 4.0;   // ambient refraction amplitude, px
// (ambient noise freq/speed now live in refract.frag.glsl, which bakes the
//  low-frequency displacement into u_refract.)
// Crest rings/foam are a single FLAT brightness. The only variation is the
// WIDTH, which breathes over time + along the ring via seamless noise. All
// crests share one opacity and are combined with max(), so overlapping a
// foam collar and a travelling ring never stacks into a brighter band.
const float RING_W_PX = 4.0;    // base crest half-width, px
const float RING_W_VAR = 3.0;   // +/- width variation along the ring, px
const float WIDTH_FREQ = 2.2;   // angular frequency of the width variation
const float WIDTH_RADIAL = 0.012; // per-ring width decorrelation (1/px)
const float WIDTH_SPEED = 0.20; // how fast the ring width breathes
const float RING_AA_PX = 0.25;  // crest edge AA, px (small = crisp)
const float RIPPLE_CREST = 0.20;// the one flat crest brightness (foam+rings)
const float RIPPLE_WAVELEN = 42.0; // ring spacing, px (dense)
const float RIPPLE_BAND = 50.0;    // ring field reach outside the rim, px
const float RIPPLE_FADE = 18.0;    // fade-out width before RIPPLE_BAND, px
const float RIPPLE_PUSH = 2.5;     // ripple UV displacement, px
const float RIPPLE_SPEED = 0.25;   // ring inward speed (slow)
const float FOAM_PX = 10.0;      // static foam collar width at the rim, px
const float FOAM_VAR = 5.0;     // +/- foam-collar width variation, px
const float FOAM_FREQ = 4.0;    // angular frequency of the collar variation
const float FOAM_SPEED = 0.5;  // how fast the collar width breathes
const float SHEEN = 0.06;       // global teal sheen toward u_deep

// Fish depth response. Submergence s in (0,1]: 0 = open water (no fish),
// small = just under the surface, large = deep.
const vec3 DEEP_BLUE = vec3(0.04, 0.20, 0.42); // deep fish tint toward this
const float DEPTH_TINT = 0.45;  // max blue mix for the deepest fish
const float SHALLOW_GAIN = 2.0; // extra ambient-refraction gain when shallow
const float SHALLOW_IN = 0.08;  // s where the refraction boost ramps in
const float SHALLOW_PEAK = 0.22;// s of strongest surface bulge
const float DEEP_CALM = 0.62;   // s by which the surface is calm again

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

// Flat-brightness crest mask whose half-width varies over time and along the
// ring. `nd` is the unit direction (seamless around the circle); `pd`
// decorrelates the width between successive rings. 0..1 with a ~1px AA edge.
float crestRing(float pd, float wl, float speed, vec2 nd, float seed,
                float phaseOff) {
  float w = fbm(nd * WIDTH_FREQ
                + vec2(seed + pd * WIDTH_RADIAL, u_time * WIDTH_SPEED));
  float halfW = RING_W_PX + (w - 0.5) * 2.0 * RING_W_VAR;
  float cyc = fract(pd / wl - u_time * speed + phaseOff);
  float dn = min(cyc, 1.0 - cyc) * wl;   // px to the nearest crest line
  return 1.0 - smoothstep(halfW - RING_AA_PX, halfW + RING_AA_PX, dn);
}

// Signed distance to a ripple source's outline: a disk with an optional
// V-notch wedge removed (rim arc + the two straight notch edges). `d` is the
// world-space offset from the centre. notch = 0 collapses to a plain disk
// (lotuses), notch > 0 gives the lilypad outline. Foam tracks this.
float sdRippleSource(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius; // plain disk (lotuses)
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y); // world -> pad-local
  // Unbounded V-notch wedge about local +x, apex at origin; <0 inside the
  // wedge. Matches lilypad.frag.glsl's abs(ang) > notch cut (no radius cap),
  // so the notch stays open past the rim instead of foam closing over it.
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x; // dist to the notch edge line
  return max(length(q) - radius, -infW);     // disk minus the open wedge
}

void main() {
  // Top-down pixel coords (matches pad coords from the sim).
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  // --- Ambient refraction: sampled from the low-res prebaked displacement. ---
  vec2 offsetPx = (texture(u_refract, v_uv).xy * 2.0 - 1.0) * REFRACT_PX;

  // A submerged fish near the surface bulges/refracts the water above it;
  // a deep one leaves it calm. Boost the ambient displacement by a hump in
  // depth space (ramp in at SHALLOW_IN, peak, fade to 0 by DEEP_CALM).
  float fd = texture(u_fishDepth, v_uv).r; // 0 = no fish here
  float shallow = smoothstep(0.0, SHALLOW_IN, fd)
                * (1.0 - smoothstep(SHALLOW_PEAK, DEEP_CALM, fd));
  offsetPx *= 1.0 + shallow * SHALLOW_GAIN;

  // One shared crest mask. Combined with max() (never summed) so every crest
  // pixel stays at exactly one opacity, even where collar + ring overlap.
  float mask = 0.0;

  // --- Surface ripples: a static foam collar + travelling rings. ---
  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= u_rippleCount) break;
    vec2 d = px - u_ripples[i].xy;
    float dist = length(d);
    vec2 nd = d / max(dist, 1e-3);
    float seed = float(i) * 5.123;
    float amp = u_rippleAmp[i]; // splashes fade out; pads/lotuses stay at 1
    float radius = u_ripples[i].z;
    // Cheap conservative cull: the true outline never sits closer than the
    // bare disk, so points this far past the rim contribute nothing.
    if (dist - radius >= RIPPLE_BAND) continue;
    // Signed distance to the actual outline so the collar follows the rim
    // arc and the V-notch edges rather than closing a circle over the notch.
    float pd = sdRippleSource(d, radius, u_ripples[i].w, u_rippleNotch[i]);
    if (pd <= 0.0 || pd >= RIPPLE_BAND) continue;

    // Static foam collar pinned to the outline; width breathes over time and
    // varies along it, but it does not travel outward.
    float fw = FOAM_PX + (fbm(nd * FOAM_FREQ
              + vec2(seed, u_time * FOAM_SPEED)) - 0.5) * 2.0 * FOAM_VAR;
    float foam = 1.0 - smoothstep(fw - RING_AA_PX, fw + RING_AA_PX, pd);
    mask = max(mask, foam * amp);

    // Travelling rings, phase-staggered per source. edgeFade depends only on
    // pd so the whole ring fades uniformly as it reaches the outer edge.
    float edgeFade =
      1.0 - smoothstep(RIPPLE_BAND - RIPPLE_FADE, RIPPLE_BAND, pd);
    offsetPx += nd * sin((pd / RIPPLE_WAVELEN - u_time * RIPPLE_SPEED
                          + seed) * 6.2831853) * RIPPLE_PUSH * edgeFade * amp;
    float ring = crestRing(pd, RIPPLE_WAVELEN, RIPPLE_SPEED, nd, seed, seed)
               * edgeFade;
    mask = max(mask, ring * amp);
  }

  vec2 suv = v_uv + offsetPx / u_res;
  vec3 col = texture(u_scene, suv).rgb;
  col = mix(col, u_deep, SHEEN);   // subtle teal water sheen
  // Deeper fish read bluer. Sample depth along the refracted lookup so the
  // tint tracks the (now displaced) fish rather than its undisturbed cell.
  float fdC = texture(u_fishDepth, suv).r;
  col = mix(col, DEEP_BLUE, fdC * DEPTH_TINT);
  col += mask * RIPPLE_CREST;      // flat, uniform-opacity crests
  // Cast shadow on the surface. Fish are already shadowed in their own pass
  // and baked into u_scene, so exclude them (fd > 0) to avoid double-darken.
  float hit = shadowHit(suv);
  float openWater = 1.0 - smoothstep(0.0, 0.04, fdC);
  col *= mix(1.0, 1.0 - u_shadowDark, hit * openWater);
  o = vec4(col, 1.0);
}
