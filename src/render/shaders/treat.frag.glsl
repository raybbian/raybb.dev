#version 300 es
precision mediump float;
in vec2 v_unit;
in vec3 v_color;
in float v_depth;
layout(location = 0) out vec4 o;
layout(location = 1) out vec4 o_depth; // R = submergence for the water pass

// Silhouette AA from context MSAA. Centre-to-rim falloff reads as a 3D
// crumb, not a flat disc. No cast-shadow sampling (intentional).
void main() {
  float r = length(v_unit);
  float shade = mix(1.12, 0.80, r);
  o = vec4(clamp(v_color * shade, 0.0, 1.0), 1.0);
  o_depth = vec4(v_depth, 0.0, 0.0, 1.0);
}
