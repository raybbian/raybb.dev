#version 300 es
in vec2 a_unit;        // unit-circle vertex, |a_unit| <= 1
in vec2 i_center;      // caster centre, world px
in vec2 i_basis0;      // world-px axis mapped by a_unit.x
in vec2 i_basis1;      // world-px axis mapped by a_unit.y
in float i_height;     // caster's normalized height (1 = top of the scene)
uniform vec2 u_res;     // logical px (same as fish/lilypad)
uniform float u_scroll; // parallax offset, logical px (same as fish/lilypad)
out float v_height;

// Pixel space -> clip space ([0,res] -> [-1,1], y flipped). Identical NDC to
// fish.vert/lilypad.vert so the mask lines up with the captured scene 1:1.
const float NDC_SCALE = 2.0;
const float NDC_OFF = 1.0;

void main() {
  vec2 world = i_center + a_unit.x * i_basis0 + a_unit.y * i_basis1;
  vec2 clip = vec2(world.x / u_res.x * NDC_SCALE - NDC_OFF,
                   NDC_OFF - (world.y - u_scroll) / u_res.y * NDC_SCALE);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_height = i_height;
}
