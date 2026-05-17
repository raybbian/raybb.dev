#version 300 es
precision mediump float;
in vec2 v_local;
in float v_notch;
in float v_seed;
in vec3 v_color;
uniform highp vec2 u_res; // logical px (shared w/ vertex stage -> match highp)
uniform vec2 u_fragRes;   // drawing-buffer px
#include "shadow.glsl"
out vec4 o;

// --- Tunable knobs (V-notch, radial star, rim shade) -----------------------
const float TAU = 6.2831853;
const int SPOKES = 11;            // star spoke count
const float FWIDTH_CLAMP = 0.05;  // cap angular AA width at the atan wrap
const float ALPHA_CUT = 0.01;     // discard near-transparent notch fragments
const float SPOKE_THRESH = 0.86;  // spoke wave visibility threshold
const float HUB_FADE_LO = 0.05;   // spokes fade out below this radius
const float HUB_FADE_HI = 0.16;   // ...fully present above this radius
const float SPOKE_DARKEN = 0.95;  // spoke color multiplier
const float RIM_LO = 0.78;        // rim shade starts at this radius
const float RIM_HI = 1.0;         // ...reaches full at the edge
const float RIM_DARKEN = 0.85;    // rim color multiplier at the edge

void main() {
  float ang = atan(v_local.y, v_local.x);
  float rad = length(v_local);
  // V-notch at local +x; clamp the angular derivative so the far rim (where
  // atan wraps and fwidth explodes) stays fully opaque, not a grey band.
  float fw = clamp(fwidth(ang), 0.0, FWIDTH_CLAMP);
  float a = smoothstep(v_notch - fw, v_notch + fw, abs(ang));
  if (a < ALPHA_CUT) discard;
  // Thin dark spokes radiating from the center, AA'd via the screen
  // derivative; faded out near the hub so they don't smear at rad -> 0.
  float wave = cos((ang + v_seed) * float(SPOKES));
  float aw = fwidth(wave);
  float spoke = smoothstep(SPOKE_THRESH - aw, SPOKE_THRESH + aw, wave);
  spoke *= smoothstep(HUB_FADE_LO, HUB_FADE_HI, rad);
  vec3 c = mix(v_color, v_color * SPOKE_DARKEN, spoke);
  c *= mix(1.0, RIM_DARKEN, smoothstep(RIM_LO, RIM_HI, rad)); // subtle rim shade
  c *= mix(1.0, 1.0 - u_shadowDark, shadowHit(gl_FragCoord.xy / u_fragRes));
  o = vec4(c, a);
}
