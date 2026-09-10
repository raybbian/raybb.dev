#version 300 es
precision mediump float;
// Side-by-side visualizer for the two ripple bake textures:
//   left half  = mask (R8, MAX-blended)
//   right half = |displacement| (RG16F, additively blended)
// The split makes the blend-equation difference legible: overlapping ripples
// cap on the mask side and stack to a brighter ridge on the displacement side.
in vec2 v_uv;
uniform sampler2D u_mask;
uniform sampler2D u_disp;
uniform vec3 u_bg;

out vec4 o;

// Single ripple peaks at length(disp) ≈ RIPPLE_PUSH * worldScale (~2.5px at
// scale 1). 5.0 puts one peak at 0.5 brightness, leaving headroom so
// constructive overlap reads as visibly brighter than either ring alone.
const float DISP_VIS_SCALE = 5.0;
// Off-white so a saturated mask still reads as foam against a light theme bg.
const float MASK_GAIN = 0.9;

void main() {
  float side = step(0.5, v_uv.x);

  float mask = texture(u_mask, v_uv).r;
  vec2 d = texture(u_disp, v_uv).rg;
  float dlen = clamp(length(d) / DISP_VIS_SCALE, 0.0, 1.0);

  vec3 leftCol  = mix(u_bg, vec3(1.0), mask * MASK_GAIN);
  vec3 rightCol = mix(u_bg, vec3(1.0), dlen);

  vec3 col = mix(leftCol, rightCol, side);

  // Thin divider at the midline (resolution-independent — ~2px at standard DPR).
  float halfDist = abs(v_uv.x - 0.5);
  float divider = 1.0 - smoothstep(0.001, 0.0025, halfDist);
  col = mix(col, vec3(0.6, 0.7, 0.78), divider * 0.6);

  o = vec4(col, 1.0);
}
