#version 300 es
precision mediump float;
#include "../../../../../render/shaders/noise.glsl"
in vec2 v_uv;
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_accent;
uniform vec2 u_seed;
out vec4 o;

#define FBM_OCT 3
#define WARP_OCT 2

// 5 square cells flush, total aspect 5:1. We pick a per-cell window so the
// noise blobs match the density used by the other figures.
const float CELL_U_RANGE = 1.0;
const float CELL_V_RANGE = 3.0;
const int   N_STEPS = 5;

void main() {
  float xN = v_uv.x * float(N_STEPS);
  int step = int(floor(xN));
  if (step > N_STEPS - 1) step = N_STEPS - 1;
  float lx = fract(xN);
  // Flip v so smaller noise-y sits at the top (matches the figure's reading order).
  float ly = 1.0 - v_uv.y;

  vec2 uv = vec2((lx - 0.5) * CELL_U_RANGE, (ly - 0.5) * CELL_V_RANGE);
  vec2 st = vec2(uv.x * ASPECT, uv.y);

  vec3 col;
  if (step == 0) {
    // value: one octave of value noise.
    col = vec3(n_vnoise(st + u_seed));
  } else if (step == 1) {
    // fbm: sum octaves with gain/lacunarity.
    col = vec3(n_fbm(st + u_seed, FBM_OCT));
  } else {
    float q = n_fbm(st * WARP_FREQ + u_seed, WARP_OCT);
    vec2 w = st + WARP_AMP * (q - WARP_BIAS);
    if (step == 2) {
      // warp: feed warped coords into FBM.
      col = vec3(n_fbm(w * N1_FREQ + u_seed, FBM_OCT));
    } else {
      float n1 = n_fbm(w * N1_FREQ + u_seed, FBM_OCT);
      float n2 = n_fbm(w * N2_FREQ + u_seed.yx + N2_OFFSET, FBM_OCT);
      float e1 = n_edge(n1, T1);
      float e2 = n_edge(n2, T2);
      if (step == 3) {
        // threshold: smoothstep both fields into a binary-ish mask.
        col = vec3(clamp(e1 * 0.6 + e2 * 0.4, 0.0, 1.0));
      } else {
        // koi: mix base / mid / accent through the two masks.
        col = u_base;
        col = mix(col, u_mid, e1);
        col = mix(col, u_accent, e2);
      }
    }
  }
  o = vec4(col, 1.0);
}
