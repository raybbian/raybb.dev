#version 300 es
precision mediump float;
in vec2 v_uv;            // fullscreen-triangle [0,1]: x -> body u, y -> body v
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_accent;
uniform vec2 u_seed;
out vec4 o;

// Bakes the koi pattern once into a texture (fish.frag then just samples it).
// This is the body-pattern half of the old fish.frag — same math, minus the
// fin sentinel. The [U_MIN,U_MAX] domain MUST track the body u extremes in
// Fish.ts (SNOUT_U_TIP .. 1 + TIP_U_OVERSHOOT).
const float U_MIN = -0.125;          // SNOUT_U_TIP (-1/8)
const float U_MAX = 1.0 + 1.0 / 30.0; // 1 + TIP_U_OVERSHOOT

// --- Knobs (kept in lockstep with the old fish.frag.glsl) ------------------
#define FBM_OCT 3
#define WARP_OCT 2
const vec2 HASH_K = vec2(123.34, 456.21);
const float HASH_ADD = 45.32;
const float FBM_LACUNARITY = 2.0;
const float FBM_GAIN = 0.5;
const float ASPECT = 3.0;
const float WARP_AMP = 0.55;
const float WARP_BIAS = 0.5;
const float WARP_FREQ = 1.2;
const float N1_FREQ = 1.6;
const float N2_FREQ = 2.3;
const float N2_OFFSET = 7.0;
const float T1 = 0.5, T2 = 0.58;

float hash(vec2 p) {
  p = fract(p * HASH_K);
  p += dot(p, p + HASH_ADD);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0, a = FBM_GAIN;
  for (int k = 0; k < oct; k++) { v += a * vnoise(p); p *= FBM_LACUNARITY; a *= FBM_GAIN; }
  return v;
}
float edge(float n, float t) {
  float aa = fwidth(n);
  return smoothstep(t - aa, t + aa, n);
}

void main() {
  vec2 uv = vec2(mix(U_MIN, U_MAX, v_uv.x), v_uv.y);
  vec2 st = vec2(uv.x * ASPECT, uv.y); // world-isotropic noise space
  float q = fbm(st * WARP_FREQ + u_seed, WARP_OCT);
  vec2 w = st + WARP_AMP * (q - WARP_BIAS);
  float n1 = fbm(w * N1_FREQ + u_seed, FBM_OCT);
  float n2 = fbm(w * N2_FREQ + u_seed.yx + N2_OFFSET, FBM_OCT);
  vec3 c = u_base;
  c = mix(c, u_mid, edge(n1, T1));
  c = mix(c, u_accent, edge(n2, T2));
  o = vec4(c, 1.0);
}
