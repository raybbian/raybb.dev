#version 300 es
precision mediump float;
#include "../../../../../render/shaders/noise.glsl"
in vec2 v_uv;
uniform vec2 u_uvScale;  // noise units across the viewport (x, y)
uniform vec2 u_pan;      // noise-space pan offset
out vec4 o;

void main() {
  // Flip v: figures use canvas-style Y (top = 0) so panning feels natural.
  vec2 fy = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 nuv = fy * u_uvScale + u_pan;
  float n = n_vnoise(nuv);
  vec3 col = vec3(n);

  // Faint integer-lattice grid in noise space — same lines you'd draw with a
  // 2D overlay, but built from `fwidth` so they stay 1 px wide at any pan.
  vec2 g = abs(fract(nuv) - 0.5);
  vec2 gw = fwidth(nuv);
  float line = min(g.x / gw.x, g.y / gw.y);
  float lineMask = (1.0 - smoothstep(0.4, 1.0, line)) * 0.18;
  col = mix(col, vec3(0.58, 0.64, 0.72), lineMask);
  o = vec4(col, 1.0);
}
