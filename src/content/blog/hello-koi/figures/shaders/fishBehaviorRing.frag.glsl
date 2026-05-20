#version 300 es
precision mediump float;
in vec2 v_local;
in float v_outerR;
in float v_innerR;
in vec4 v_color;
in float v_arcFrac;
out vec4 o;
// Instanced ring with an optional arc mask. Used by the fish-behavior debug
// overlay for state pips, treat eat-radii, and the cursor's avoid radius —
// sated fish's pip drains its arc as the cooldown elapses.
void main() {
  float r = length(v_local);
  float aa = fwidth(r);
  // Annular band: inside the outer rim, outside the inner rim.
  float outerMask = 1.0 - smoothstep(v_outerR - aa, v_outerR + aa, r);
  float innerMask = 1.0 - smoothstep(v_innerR - aa, v_innerR + aa, r);
  float ring = outerMask - innerMask;
  // Arc mask: clockwise from 12 o'clock. atan(x, -y) puts 0 at top with y
  // increasing downward (screen px convention).
  float angle = atan(v_local.x, -v_local.y);
  float frac = angle < 0.0 ? (angle + 6.2831853) / 6.2831853
                           : angle / 6.2831853;
  float arc = step(frac, v_arcFrac);
  float a = ring * arc * v_color.a;
  if (a <= 0.0) discard;
  o = vec4(v_color.rgb, a);
}
