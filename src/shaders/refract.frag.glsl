#version 300 es
precision mediump float;
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
out vec4 o;

// Ambient water refraction, baked once per frame into a low-res texture and
// sampled by water.frag (the displacement is low-frequency, so quarter-res is
// visually lossless and removes 4 fullscreen fbm evaluations). Knobs/noise are
// kept in lockstep with water.frag.glsl.
const float REFRACT_FREQ = 3.0; // ambient noise sampling scale (screens)
const float REFRACT_SPEED = 0.15;// ambient drift speed (slow)

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  vec2 np = px / u_res.y * REFRACT_FREQ;
  float t = u_time * REFRACT_SPEED;
  vec2 disp = vec2(
    fbm(np + vec2(t, 0.0)) - fbm(np - vec2(t, 0.0)),
    fbm(np.yx + vec2(0.0, t)) - fbm(np.yx - vec2(0.0, t)));
  // |disp| < 1 (fbm sums to <0.875), so this stays in [0,1]; water.frag
  // reconstructs via disp = tex.xy * 2 - 1.
  o = vec4(disp * 0.5 + 0.5, 0.0, 1.0);
}
