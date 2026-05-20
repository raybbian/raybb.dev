#version 300 es
// Instanced arrow: per-instance start/end in screen px, color, and base width.
// The vertex shader builds an oriented quad in screen space whose length is
// the segment length plus a fixed arrowhead allowance, leaving the fragment
// shader to draw a thin shaft with a triangular head.
in vec2 a_unit;     // unit quad in [0, 1] x [-1, 1]
in vec2 i_start;
in vec2 i_end;
in vec4 i_color;
in float i_width;
uniform vec2 u_res;
out vec2 v_local;   // (along, across) in px; along in [0, len], across centered
out float v_len;
out float v_width;
out vec4 v_color;

void main() {
  vec2 d = i_end - i_start;
  float len = max(length(d), 1e-3);
  vec2 along = d / len;
  vec2 across = vec2(-along.y, along.x);
  // Half-width that includes a couple of AA pixels and enough room for the
  // arrowhead to flare past the shaft.
  float halfW = max(i_width, 4.0) + 2.0;
  vec2 world = i_start + along * (a_unit.x * len)
             + across * (a_unit.y * halfW);
  vec2 clip = vec2(world.x / u_res.x * 2.0 - 1.0,
                   1.0 - world.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = vec2(a_unit.x * len, a_unit.y * halfW);
  v_len = len;
  v_width = i_width;
  v_color = i_color;
}
