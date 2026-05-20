#version 300 es
in vec2 a_unit;
in vec2 i_center;
in float i_radius;
in float i_rot;
in float i_notch;
in float i_seed;
in vec3 i_color;
uniform vec2 u_res;
uniform float u_scroll; // parallax offset in logical px, subtracted from world y
uniform vec2 u_castOffset; // shadow-cast pass: pre-project to the floor; 0 otherwise
out vec2 v_local;
out float v_notch;
out float v_seed;
out vec3 v_color;

// Pixel space -> clip space ([0,res] -> [-1,1], y flipped).
const float NDC_SCALE = 2.0;
const float NDC_OFF = 1.0;

void main() {
  vec2 p = a_unit * i_radius;
  float c = cos(i_rot), s = sin(i_rot);
  vec2 r = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 world = i_center + r + u_castOffset;
  vec2 clip = vec2(world.x / u_res.x * NDC_SCALE - NDC_OFF,
                   NDC_OFF - (world.y - u_scroll) / u_res.y * NDC_SCALE);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_unit;
  v_notch = i_notch;
  v_seed = i_seed;
  v_color = i_color;
}
