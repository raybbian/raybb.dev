#version 300 es
in vec2 a_unit;
in vec2 i_center;
in float i_radius;
uniform vec2 u_res;
out vec2 v_unit;
void main() {
  vec2 world = i_center + a_unit * i_radius;
  vec2 clip = vec2(world.x / u_res.x * 2.0 - 1.0,
                   1.0 - world.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_unit = a_unit;
}
