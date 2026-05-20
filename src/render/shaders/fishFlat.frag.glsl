#version 300 es
precision mediump float;
in vec4 v_color;
in vec2 v_uv;
layout(location = 0) out vec4 o;

// Flat body shader for blog figures: no pattern texture, no shadow receiver,
// no dorsal self-shadow band. Vertex colors from FishGeometry are emitted as
// authored (BASE for body, FIN for caudal/dorsal). v_uv is declared to match
// `fish.vert.glsl`'s outputs but is ignored here.
void main() {
  // Reference v_uv so the compiler doesn't strip the varying and break the
  // vertex/fragment interface that the production vertex shader emits.
  vec2 unused = v_uv;
  o = vec4(v_color.rgb + 0.0 * unused.x, v_color.a);
}
