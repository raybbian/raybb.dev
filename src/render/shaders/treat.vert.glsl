#version 300 es
in vec2 a_unit;     // unit-circle fan vertex
in vec2 i_center;   // treat centre, scene px
in float i_radius;  // drawn morsel radius, px
in float i_depth;   // submergence, written to the depth attachment
in vec3 i_color;
uniform vec2 u_res;
uniform float u_scroll; // parallax offset in logical px, subtracted from world y
out vec2 v_unit;
out vec3 v_color;
out float v_depth;

// Pixel space -> clip space ([0,res] -> [-1,1], y flipped).
const float NDC_SCALE = 2.0;
const float NDC_OFF = 1.0;

void main() {
  vec2 world = i_center + a_unit * i_radius;
  vec2 clip = vec2(world.x / u_res.x * NDC_SCALE - NDC_OFF,
                   NDC_OFF - (world.y - u_scroll) / u_res.y * NDC_SCALE);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_unit = a_unit;
  v_color = i_color;
  v_depth = i_depth;
}
