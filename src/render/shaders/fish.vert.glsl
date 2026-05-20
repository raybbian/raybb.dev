#version 300 es
in vec2 a_pos;
in vec4 a_color;
in vec2 a_uv;
uniform vec2 u_res;
uniform float u_scroll; // parallax offset in logical px, subtracted from world y
uniform vec2 u_castOffset; // shadow-cast pass: pre-project to the floor; 0 otherwise
out vec4 v_color;
out vec2 v_uv;

// Pixel space -> clip space ([0,res] -> [-1,1], y flipped).
const float NDC_SCALE = 2.0;
const float NDC_OFF = 1.0;

void main() {
  vec2 world = a_pos + u_castOffset;
  vec2 clip = vec2(world.x / u_res.x * NDC_SCALE - NDC_OFF,
                   NDC_OFF - (world.y - u_scroll) / u_res.y * NDC_SCALE);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
  v_uv = a_uv;
}
