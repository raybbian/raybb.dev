#version 300 es
precision mediump float;
in vec2 v_unit;
uniform vec3 u_color;
out vec4 o;
// Mirrors the production TreatRenderer's centre-to-rim shade so the morsel
// reads as a small 3D crumb on the surface, not a flat disc.
void main() {
  float r = length(v_unit);
  float shade = mix(1.12, 0.80, r);
  o = vec4(clamp(u_color * shade, 0.0, 1.0), 1.0);
}
