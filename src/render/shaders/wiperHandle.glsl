// Shared wiper-handle overlay for split-panel comparison figures
// (flat-vs-toon, shadows-on-off). The white bar reads as a neutral
// divider; the accent dot is the affordance. `u_res` is declared by the
// including shader.
uniform float u_wiper;
uniform vec3 u_handleDot;

const float WH_HANDLE_LINE_PX = 2.0;
const float WH_HANDLE_DOT_R_PX = 8.0;
const float WH_AA_PX = 1.0;
const vec3 WH_BAR = vec3(1.0, 1.0, 1.0);

// `px` is the fragment's top-down pixel coord (matches the figures'
// vec2(v_uv.x, 1.0 - v_uv.y) * u_res convention). Returns the colour
// with the bar + dot composited on top.
vec3 applyWiperHandle(vec3 col, vec2 px, vec2 res) {
  float wiperPx = u_wiper * res.x;
  float lineDx = abs(px.x - wiperPx);
  float bar = 1.0 - smoothstep(WH_HANDLE_LINE_PX, WH_HANDLE_LINE_PX + WH_AA_PX, lineDx);
  col = mix(col, WH_BAR, bar * 0.85);
  float dh = length(px - vec2(wiperPx, res.y * 0.5));
  float dot = 1.0 - smoothstep(WH_HANDLE_DOT_R_PX, WH_HANDLE_DOT_R_PX + WH_AA_PX, dh);
  col = mix(col, u_handleDot, dot);
  return col;
}
