#version 300 es
in vec2 a_unit;     // padded petal-local box: x ~ root->tip, y ~ across
in vec2 i_center;   // lotus centre, px
in float i_angle;   // outward facing direction (base + sway + flutter), rad
in float i_len;     // petal root -> tip length, px
in float i_half;    // petal half-width at the base, px
in float i_inner;   // petal-root distance from the centre, px
in vec3 i_color;
in float i_seed;
uniform vec2 u_res;
uniform float u_scroll; // parallax offset in logical px, subtracted from world y
uniform vec2 u_castOffset; // shadow-cast pass: pre-project to the floor; 0 otherwise
out vec2 v_local;   // triangle space: A=(0,-1) B=(0,1) C=(1,0)
out vec3 v_color;
out float v_seed;

// Pixel space -> clip space ([0,res] -> [-1,1], y flipped).
const float NDC_SCALE = 2.0;
const float NDC_OFF = 1.0;

void main() {
  // Place the petal along its outward axis: root at i_inner, tip at
  // i_inner + i_len; the box is padded past [0,1]x[-1,1] so the fragment
  // shader's rounded edge has bleed room and is not clipped by the quad.
  float dist = i_inner + a_unit.x * i_len;
  float perp = a_unit.y * i_half;
  vec2 dir = vec2(cos(i_angle), sin(i_angle));
  vec2 nrm = vec2(-dir.y, dir.x);
  // Perfectly circular bloom: equal radial scale in x and y, rings concentric.
  vec2 world = i_center + dir * dist + nrm * perp + u_castOffset;
  vec2 clip = vec2(world.x / u_res.x * NDC_SCALE - NDC_OFF,
                   NDC_OFF - (world.y - u_scroll) / u_res.y * NDC_SCALE);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_unit;
  v_color = i_color;
  v_seed = i_seed;
}
