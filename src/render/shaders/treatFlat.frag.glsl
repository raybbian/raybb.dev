#version 300 es
precision mediump float;
in vec2 v_unit;
in vec3 v_color;
out vec4 o;

// Single-output variant of treat.frag.glsl for sketches that render
// directly to the default framebuffer (no MRT depth attachment).
// Otherwise identical: centre-to-rim shade so the disc reads as a 3D crumb.
void main() {
  float r = length(v_unit);
  float shade = mix(1.12, 0.80, r);
  o = vec4(clamp(v_color * shade, 0.0, 1.0), 1.0);
}
