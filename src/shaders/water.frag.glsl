#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_refract;  // low-res ambient displacement (RG = disp*.5+.5)
uniform highp vec2 u_res; // highp: shadow sample coord + fwidth AA need it
uniform float u_time;
uniform float u_scale;     // screenScale: px-unit constants scale like sizes
uniform vec3 u_deep;       // deep-water tint target
uniform int u_rippleCount;
uniform vec4 u_ripples[MAX_RIPPLES];      // cx, cy, radius, rot (px / rad)
uniform float u_rippleNotch[MAX_RIPPLES]; // V-notch half-angle, rad
uniform float u_rippleAmp[MAX_RIPPLES];   // 0..1 strength (1 = pads/lotuses)
uniform float u_rippleFoam[MAX_RIPPLES];  // 1 = static collar, 0 = ring only
uniform float u_rippleSeed[MAX_RIPPLES];  // stable per-source noise id
uniform sampler2D u_fishDepth;      // R = fish submergence, 0 = open water
#include "shadow.glsl"
out vec4 o;

const float REFRACT_PX = 4.0;
// ambient noise freq/speed live in refract.frag.glsl (baked into u_refract).
// Crests are one FLAT brightness; only WIDTH varies. All crests share one
// opacity and are combined with max(), so an overlapping foam collar and
// travelling ring never stack into a brighter band.
const float RING_W_PX = 4.0;
const float RING_W_VAR = 3.0;
const float WIDTH_FREQ = 2.2;
const float WIDTH_RADIAL = 0.012; // per-ring width decorrelation (1/px)
const float WIDTH_SPEED = 0.20;
const float RING_AA_PX = 0.25;
const float RIPPLE_CREST = 0.20;
const float RIPPLE_WAVELEN = 42.0;
const float RIPPLE_BAND = 50.0;    // ring field reach outside the rim, px
const float RIPPLE_FADE = 18.0;    // fade-out width before RIPPLE_BAND, px
const float RIPPLE_PUSH = 2.5;
const float RIPPLE_SPEED = 0.25;
const float FOAM_PX = 10.0;
const float FOAM_VAR = 5.0;
const float FOAM_FREQ = 4.0;
const float FOAM_SPEED = 0.5;
const float SHEEN = 0.06;

// Submergence s in (0,1]: 0 = open water (no fish), small = near surface,
// large = deep.
const vec3 DEEP_BLUE = vec3(0.04, 0.20, 0.42);
const float DEPTH_TINT = 0.45;
const float SHALLOW_GAIN = 2.0;
const float SHALLOW_IN = 0.08;  // s where the refraction boost ramps in
const float SHALLOW_PEAK = 0.22;
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

// `nd` = unit direction (seamless around the circle); `pd` decorrelates the
// width between successive rings.
float crestRing(float pd, float wl, float speed, vec2 nd, float seed,
                float phaseOff) {
  // pd is scaled px; bring it back to reference px for the 1/px decorrelation
  // so the per-ring pattern looks identical at any screen scale.
  float w = fbm(nd * WIDTH_FREQ
                + vec2(seed + pd / u_scale * WIDTH_RADIAL, u_time * WIDTH_SPEED));
  float halfW = (RING_W_PX + (w - 0.5) * 2.0 * RING_W_VAR) * u_scale;
  float cyc = fract(pd / wl - u_time * speed + phaseOff); // wl is pre-scaled
  float dn = min(cyc, 1.0 - cyc) * wl; // px to the nearest crest line
  float aa = RING_AA_PX * u_scale;
  return 1.0 - smoothstep(halfW - aa, halfW + aa, dn);
}

// SDF to a ripple source: a disk with an optional V-notch wedge removed.
// `d` = world-space offset from centre. notch = 0 -> plain disk (lotuses).
float sdRippleSource(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y); // world -> pad-local
  // Unbounded wedge (no radius cap): matches lilypad.frag's abs(ang) > notch
  // cut, so the notch stays open past the rim, not closed over by foam.
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x; // dist to the notch edge line
  return max(length(q) - radius, -infW);
}

void main() {
  // Top-down px coords (matches sim pad coords): v flipped.
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;

  vec2 offsetPx = (texture(u_refract, v_uv).xy * 2.0 - 1.0) * REFRACT_PX * u_scale;

  // A fish near the surface bulges the water above it; a deep one leaves it
  // calm. Hump in depth space (ramp at SHALLOW_IN, peak, fade by DEEP_CALM).
  float fd = texture(u_fishDepth, v_uv).r; // 0 = no fish here
  float shallow = smoothstep(0.0, SHALLOW_IN, fd)
                * (1.0 - smoothstep(SHALLOW_PEAK, DEEP_CALM, fd));
  offsetPx *= 1.0 + shallow * SHALLOW_GAIN;

  float mask = 0.0;

  // px-unit ripple constants scale with the screen like ripple radii do.
  float band = RIPPLE_BAND * u_scale;
  float fade = RIPPLE_FADE * u_scale;
  float aa = RING_AA_PX * u_scale;
  float wavelen = RIPPLE_WAVELEN * u_scale;

  for (int i = 0; i < MAX_RIPPLES; i++) {
    if (i >= u_rippleCount) break;
    vec2 d = px - u_ripples[i].xy;
    float dist = length(d);
    vec2 nd = d / max(dist, 1e-3);
    // Per-SOURCE (not per-slot): the emission array reorders as bands stream,
    // so an index-based seed would teleport a pad's foam/crest pattern.
    float seed = u_rippleSeed[i];
    float amp = u_rippleAmp[i]; // splashes fade out; pads/lotuses stay at 1
    float radius = u_ripples[i].z;
    // Conservative cull: the true outline is never closer than the bare disk.
    if (dist - radius >= band) continue;
    float pd = sdRippleSource(d, radius, u_ripples[i].w, u_rippleNotch[i]);
    if (pd <= 0.0 || pd >= band) continue;

    // Static collar pinned to the outline (does not travel outward). Gated
    // off for dynamic ripples so they read as one travelling ring, not two.
    float fw = (FOAM_PX + (fbm(nd * FOAM_FREQ
              + vec2(seed, u_time * FOAM_SPEED)) - 0.5) * 2.0 * FOAM_VAR) * u_scale;
    float foam = 1.0 - smoothstep(fw - aa, fw + aa, pd);
    mask = max(mask, foam * amp * u_rippleFoam[i]);

    // edgeFade depends only on pd so the whole ring fades uniformly.
    float edgeFade =
      1.0 - smoothstep(band - fade, band, pd);
    offsetPx += nd * sin((pd / wavelen - u_time * RIPPLE_SPEED
                          + seed) * 6.2831853) * RIPPLE_PUSH * u_scale
                * edgeFade * amp;
    float ring = crestRing(pd, wavelen, RIPPLE_SPEED, nd, seed, seed)
               * edgeFade;
    mask = max(mask, ring * amp);
  }

  vec2 suv = v_uv + offsetPx / u_res;
  vec3 col = texture(u_scene, suv).rgb;
  col = mix(col, u_deep, SHEEN);
  // Sample depth along the refracted lookup so the tint tracks the displaced
  // fish, not its undisturbed cell.
  float fdC = texture(u_fishDepth, suv).r;
  col = mix(col, DEEP_BLUE, fdC * DEPTH_TINT);
  col += mask * RIPPLE_CREST;
  // Fish are already shadowed in their own pass (baked into u_scene), so
  // exclude them (fd > 0) here to avoid double-darken.
  float hit = shadowHit(suv);
  float openWater = 1.0 - smoothstep(0.0, 0.04, fdC);
  col *= mix(1.0, 1.0 - u_shadowDark, hit * openWater);
  o = vec4(col, 1.0);
}
