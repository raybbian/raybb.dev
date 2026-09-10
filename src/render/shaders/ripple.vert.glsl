#version 300 es
precision mediump float;
// Instanced quad covering one ripple's effective area (radius + RIPPLE_BAND).
// Used by both the mask and displacement bake passes — same vertices,
// different fragment shader per pass.
// Explicit attribute locations so one VAO feeds both the mask and disp
// programs (otherwise the GLSL linker is free to assign different slots).
layout(location = 0) in vec2 a_unit;   // unit quad in [-1, 1]^2
layout(location = 1) in vec4 i_a;      // (cx, cy, radius, rot) in logical px / rad
layout(location = 2) in vec4 i_b;      // (notch, amp, foam, seed)
uniform vec2 u_res;        // logical px
uniform float u_scale;     // worldScale: px constants follow it
out vec2 v_local;          // world-px offset from ripple center
flat out vec4 v_a;
flat out vec4 v_b;

// Must match water.frag.glsl's RIPPLE_BAND so the quad covers every
// fragment the SDF could keep.
const float RIPPLE_BAND = 50.0;

void main() {
  // Quad covers up to one full BAND past the ripple's rim (the fragment
  // discards beyond pd >= band, so anything farther never contributes).
  float quadR = i_a.z + RIPPLE_BAND * u_scale;
  vec2 worldPx = i_a.xy + a_unit * quadR;
  // Match water.frag.glsl's coordinate convention: the composite reads the
  // baked textures with v_uv, where v_uv.y = 1 maps to screen-top
  // (px.y = 0). Flip y when projecting to NDC so the bake's texel layout
  // matches the composite's sampling.
  gl_Position = vec4(
    (worldPx.x / u_res.x) * 2.0 - 1.0,
    1.0 - 2.0 * (worldPx.y / u_res.y),
    0.0, 1.0);
  v_local = a_unit * quadR;
  v_a = i_a;
  v_b = i_b;
}
