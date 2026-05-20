#version 300 es
precision mediump float;
#include "noise.glsl"
in vec2 v_uv;            // fullscreen-triangle [0,1]: x -> body u, y -> body v
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_accent;
uniform vec2 u_seed;
out vec4 o;

// Baked once into a texture; fish.frag samples it. The [U_MIN,U_MAX] domain
// MUST track the body u extremes in Fish.ts (SNOUT_U_TIP .. 1+TIP_U_OVERSHOOT).
const float U_MIN = -0.125;          // SNOUT_U_TIP (-1/8)
const float U_MAX = 1.0 + 1.0 / 30.0; // 1 + TIP_U_OVERSHOOT

#define FBM_OCT 3
#define WARP_OCT 2

void main() {
  vec2 uv = vec2(mix(U_MIN, U_MAX, v_uv.x), v_uv.y);
  vec2 st = vec2(uv.x * ASPECT, uv.y); // world-isotropic noise space
  float q = n_fbm(st * WARP_FREQ + u_seed, WARP_OCT);
  vec2 w = st + WARP_AMP * (q - WARP_BIAS);
  float n1 = n_fbm(w * N1_FREQ + u_seed, FBM_OCT);
  float n2 = n_fbm(w * N2_FREQ + u_seed.yx + N2_OFFSET, FBM_OCT);
  vec3 c = u_base;
  c = mix(c, u_mid, n_edge(n1, T1));
  c = mix(c, u_accent, n_edge(n2, T2));
  o = vec4(c, 1.0);
}
