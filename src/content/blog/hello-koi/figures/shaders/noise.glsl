const vec2  HASH_K   = vec2(123.34, 456.21);
const float HASH_ADD = 45.32;
const float FBM_LACUNARITY = 2.0;    // each octave doubles the frequency...
const float FBM_GAIN       = 0.5;    // ...and halves the amplitude
const float ASPECT = 3.0;            // body UV is wider than tall; keep noise cells square in world units
const float WARP_AMP  = 0.55;
const float WARP_BIAS = 0.5;         // centers the warp push on 0 so the pattern doesn't drift
const float WARP_FREQ = 1.2;
const float N1_FREQ   = 1.6;
const float N2_FREQ   = 2.3;
const float N2_OFFSET = 7.0;         // de-syncs n2 from n1 so accents don't sit on top of blobs
const float T1 = 0.5;
const float T2 = 0.58;

// Deterministic pseudo-random in [0,1) from a 2D point.
float n_hash(vec2 p) {
  p = fract(p * HASH_K);            // scramble into [0,1)^2
  p += dot(p, p + HASH_ADD);        // mix x and y so changing one shifts both
  return fract(p.x * p.y);
}

// Value noise: hash the integer lattice, bilinearly interpolate with a smoothstep.
float n_vnoise(vec2 p) {
  vec2 i = floor(p);                              // cell origin
  vec2 f = fract(p);                              // position within cell [0,1)
  vec2 u = f * f * (3.0 - 2.0 * f);               // smoothstep weights to remove diagonal seams
  return mix(mix(n_hash(i),              n_hash(i + vec2(1, 0)), u.x),
             mix(n_hash(i + vec2(0, 1)), n_hash(i + vec2(1, 1)), u.x), u.y);
}

// Fractal Brownian motion: sum value noise across `oct` octaves.
float n_fbm(vec2 p, int oct) {
  float v = 0.0;
  float a = FBM_GAIN;                  // amplitude of the next octave
  for (int k = 0; k < oct; k++) {
    v += a * n_vnoise(p);
    p *= FBM_LACUNARITY;               // zoom in for the next octave
    a *= FBM_GAIN;                     // ...fading it down each pass
  }
  return v;
}

// Analytic AA across a threshold of a noise field, using the field's screen-space derivative.
float n_edge(float n, float t) {
  float aa = fwidth(n);                // ~how much n changes between neighboring pixels
  return smoothstep(t - aa, t + aa, n);
}
