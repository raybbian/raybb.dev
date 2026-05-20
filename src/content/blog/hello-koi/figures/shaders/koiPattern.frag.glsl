#version 300 es
precision mediump float;
#include "../../../../../render/shaders/noise.glsl"
in vec2 v_uv;
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_accent;
uniform vec2 u_seed;
uniform vec2 u_uvCenter;
uniform vec2 u_uvRange;
out vec4 o;

#define FBM_OCT 3
#define WARP_OCT 2

// Same composition as pattern.frag.glsl, but the viewport shows a windowed
// region in body-UV space (center / range uniforms) instead of the full body.
void main() {
  // Flip v so the figure uses canvas-style Y (top = u_uvCenter - range/2).
  vec2 fy = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 uv = (fy - 0.5) * u_uvRange + u_uvCenter;
  vec2 st = vec2(uv.x * ASPECT, uv.y);
  float q = n_fbm(st * WARP_FREQ + u_seed, WARP_OCT);
  vec2 w = st + WARP_AMP * (q - WARP_BIAS);
  float n1 = n_fbm(w * N1_FREQ + u_seed, FBM_OCT);
  float n2 = n_fbm(w * N2_FREQ + u_seed.yx + N2_OFFSET, FBM_OCT);
  vec3 c = u_base;
  c = mix(c, u_mid, n_edge(n1, T1));
  c = mix(c, u_accent, n_edge(n2, T2));
  o = vec4(c, 1.0);
}
