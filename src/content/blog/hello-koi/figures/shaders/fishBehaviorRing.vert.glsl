#version 300 es
in vec2 a_unit;     // unit quad in [-1, 1]
in vec2 i_center;
in float i_outerR;
in float i_innerR;
in vec4 i_color;
in float i_arcFrac;
uniform vec2 u_res;
out vec2 v_local;
out float v_outerR;
out float v_innerR;
out vec4 v_color;
out float v_arcFrac;
void main() {
  // +2 px AA pad on the bounding quad so the smoothstep edges don't clip.
  float r = i_outerR + 2.0;
  vec2 world = i_center + a_unit * r;
  vec2 clip = vec2(world.x / u_res.x * 2.0 - 1.0,
                   1.0 - world.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_unit * r;
  v_outerR = i_outerR;
  v_innerR = i_innerR;
  v_color = i_color;
  v_arcFrac = i_arcFrac;
}
