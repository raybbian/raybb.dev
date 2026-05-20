#version 300 es
precision mediump float;

in vec2 v_uv;            // x -> body u, y -> body v, all in [0, 1]
uniform vec3 u_base;     // belly / background color
uniform vec3 u_mid;      // primary blob color
uniform vec3 u_accent;   // accent flecks
uniform vec2 u_seed;     // per-fish offset so each koi reads differently
out vec4 o;

#define FBM_OCT 3
#define WARP_OCT 2

void main() {
  vec2 uv = v_uv;
  vec2 st = vec2(uv.x * ASPECT, uv.y);                             // world-isotropic noise space
  float q = n_fbm(st * WARP_FREQ + u_seed, WARP_OCT);             // low-freq field used only as a warp source
  vec2  w = st + WARP_AMP * (q - WARP_BIAS);                       // domain-warped sample point
  float n1 = n_fbm(w * N1_FREQ + u_seed,                FBM_OCT); // main blob field
  float n2 = n_fbm(w * N2_FREQ + u_seed.yx + N2_OFFSET, FBM_OCT); // accent field, seeded differently so it doesn't overlap n1
  vec3 c = u_base;
  c = mix(c, u_mid,    n_edge(n1, T1));                           // paint blobs over base
  c = mix(c, u_accent, n_edge(n2, T2));                           // paint accents over that
  o = vec4(c, 1.0);
}
