#version 300 es
precision mediump float;
#include "../../../../../render/shaders/noise.glsl"
in vec2 v_uv;
uniform vec2 u_uvScale;
uniform vec2 u_pan;
uniform float u_time;
out vec4 o;

const float REFRACT_SPEED = 0.15;

void main() {
  vec2 fy = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 nuv = fy * u_uvScale + u_pan;
  float t = u_time * REFRACT_SPEED;
  vec2 disp = n_displacement(nuv, t);
  vec3 col = vec3(disp * 0.5 + 0.5, 0.0);

  vec2 g = abs(fract(nuv) - 0.5);
  vec2 gw = fwidth(nuv);
  float line = min(g.x / gw.x, g.y / gw.y);
  float lineMask = (1.0 - smoothstep(0.4, 1.0, line)) * 0.18;
  col = mix(col, vec3(0.58, 0.64, 0.72), lineMask);
  o = vec4(col, 1.0);
}
