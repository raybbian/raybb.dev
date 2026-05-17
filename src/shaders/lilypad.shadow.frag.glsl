#version 300 es
precision mediump float;
in vec2 v_local;
in float v_notch;
// Caster pass: reuse lilypad.vert, carve the same V-notch wedge as
// lilypad.frag so the shadow keeps the pad's real outline, and emit height.
uniform float u_castHeight;
layout(location = 0) out vec4 o;

const float FWIDTH_CLAMP = 0.05;

void main() {
  float ang = atan(v_local.y, v_local.x);
  float fw = clamp(fwidth(ang), 0.0, FWIDTH_CLAMP);
  float a = smoothstep(v_notch - fw, v_notch + fw, abs(ang));
  if (a < 0.5) discard; // inside the notch wedge -> no shadow
  o = vec4(u_castHeight, 1.0, 0.0, 0.0); // premultiplied (height, coverage)
}
