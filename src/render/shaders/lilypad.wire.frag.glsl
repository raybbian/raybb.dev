#version 300 es
precision mediump float;
in vec2 v_local;
in float v_notch;
in float v_seed;
in vec3 v_color;
uniform vec4 u_wireColor;
out vec4 o;

// Mirrors lilypad.frag's notch carve so the wireframe overlay also drops
// the "removed" wedges. No spokes / no rim shading — just the mesh edges.
const float FWIDTH_CLAMP = 0.05;
const float ALPHA_CUT = 0.01;

void main() {
  float ang = atan(v_local.y, v_local.x);
  float fw = clamp(fwidth(ang), 0.0, FWIDTH_CLAMP);
  float a = smoothstep(v_notch - fw, v_notch + fw, abs(ang));
  if (a < ALPHA_CUT) discard;
  o = vec4(u_wireColor.rgb, u_wireColor.a * a);
}
