#version 300 es
precision mediump float;
#include "noise.glsl"
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
out vec4 o;

// Baked once per frame at low-res: the displacement is low-frequency, so
// quarter-res is visually lossless and saves 4 fullscreen fbm evals.
// Noise kept in lockstep with water.frag.glsl via n_displacement.
const float REFRACT_FREQ = 3.0;
const float REFRACT_SPEED = 0.15;

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  vec2 np = px / u_res.y * REFRACT_FREQ;
  float t = u_time * REFRACT_SPEED;
  vec2 disp = n_displacement(np, t);
  // |disp| < 1 (fbm sums to <0.875) so this stays in [0,1]; water.frag
  // reconstructs via disp = tex.xy * 2 - 1.
  o = vec4(disp * 0.5 + 0.5, 0.0, 1.0);
}
