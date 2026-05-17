#version 300 es
precision mediump float;
in vec2 v_unit;
in vec3 v_color;
in float v_depth;
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o_depth; // R = submergence for the water pass

// Silhouette AA comes from the context MSAA (same as the fish fins). A subtle
// centre-to-rim falloff makes the morsel read as a small 3D crumb rather than
// a flat disc. No cast-shadow sampling — kept intentionally minimal.
void main() {
  float r = length(v_unit);
  float shade = mix(1.12, 0.80, r);
  o = vec4(clamp(v_color * shade, 0.0, 1.0), 1.0);
  o_depth = vec4(v_depth, 0.0, 0.0, 1.0);
}
