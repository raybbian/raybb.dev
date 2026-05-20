// Shared general-purpose noise primitives (value noise, fbm, threshold AA,
// displacement curl). #include'd from production and figure shaders:
//   - render/shaders/pattern.frag.glsl                                  (koi pattern, full pipeline)
//   - render/shaders/refract.frag.glsl                                  (water refraction displacement)
//   - content/blog/hello-koi/figures/shaders/valueNoise.frag.glsl       (single vnoise sample, paged)
//   - content/blog/hello-koi/figures/shaders/koiSteps.frag.glsl         (per-step strip)
//   - content/blog/hello-koi/figures/shaders/koiPattern.frag.glsl       (koi pipeline at a fixed window)
//   - content/blog/hello-koi/figures/shaders/displacementNoise.frag.glsl (refract field, paged)
//
// `vnoise` = classic 2D value noise: hash the integer lattice, bilinearly
// interpolate with a smoothstep.

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
const float T1 = 0.5;
const float T2 = 0.58;

float n_hash(vec2 p) {
  p = fract(p * HASH_K);
  p += dot(p, p + HASH_ADD);
  return fract(p.x * p.y);
}
float n_vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(n_hash(i),              n_hash(i + vec2(1, 0)), u.x),
             mix(n_hash(i + vec2(0, 1)), n_hash(i + vec2(1, 1)), u.x), u.y);
}
float n_fbm(vec2 p, int oct) {
  float v = 0.0, a = FBM_GAIN;
  for (int k = 0; k < oct; k++) {
    v += a * n_vnoise(p);
    p *= FBM_LACUNARITY;
    a *= FBM_GAIN;
  }
  return v;
}
// Analytic AA across a threshold of a noise field, using the field's
// screen-space derivative.
float n_edge(float n, float t) {
  float aa = fwidth(n);
  return smoothstep(t - aa, t + aa, n);
}
// Animated displacement field used by the water refraction pass. The
// directional difference of fbm(np ± (t,0)) yields a smooth curl-like
// vector field whose components stay in (-1, 1). `np` is noise-space
// coords; `t` is seconds × speed.
vec2 n_displacement(vec2 np, float t) {
  return vec2(
    n_fbm(np + vec2(t, 0.0), 3) - n_fbm(np - vec2(t, 0.0), 3),
    n_fbm(np.yx + vec2(0.0, t), 3) - n_fbm(np.yx - vec2(0.0, t), 3));
}
