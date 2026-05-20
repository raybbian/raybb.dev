#version 300 es
precision mediump float;
in vec2 v_uv;
uniform vec2 u_res;       // panel size, px
uniform float u_time;
uniform int u_count;
uniform vec4 u_disks[MAX_DISKS];     // cx, cy, radius, rot
uniform float u_notch[MAX_DISKS];    // 0 = plain, >0 = half-angle of wedge
uniform float u_seed[MAX_DISKS];
out vec4 o;

// Mirror the values used in render/shaders/water.frag.glsl so the figure
// shows the production foam pattern, not a stand-in.
const float FOAM_PX = 10.0;
const float FOAM_VAR = 5.0;
const float FOAM_FREQ = 4.0;
const float FOAM_SPEED = 0.5;
const float RING_AA_PX = 0.6; // wider than prod (0.25) — figure renders smaller
const float BAND_PX = 60.0;   // SDF visualization fades out past this distance

const vec3 BG_DEEP = vec3(0.06, 0.26, 0.25);  // matches u_deep dark pond
const vec3 FOAM    = vec3(0.85, 0.94, 0.96);
const vec3 DISK    = vec3(0.18, 0.42, 0.30);  // a pad/lotus stand-in
const vec3 SDF_LO  = vec3(0.10, 0.12, 0.16);  // far outside the disk
const vec3 SDF_HI  = vec3(0.92, 0.95, 1.00);  // at the rim
const vec3 FOAM_BAND = vec3(0.35, 0.95, 0.70); // marks pixels where foam > 0
const vec3 RIM_LINE  = vec3(1.00, 0.85, 0.30); // pd = 0 isoline
const vec3 DIVIDER   = vec3(0.95, 0.97, 1.00);

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

// Same SDF as render/shaders/water.frag.glsl: a disk, optionally with a wedge
// of half-angle `notch` carved out at orientation `rot`.
float sdRippleSource(vec2 d, float radius, float rot, float notch) {
  if (notch <= 0.0) return length(d) - radius;
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 cs = vec2(cos(notch), sin(notch));
  float infW = cs.x * abs(q.y) - cs.y * q.x;
  return max(length(q) - radius, -infW);
}

// Scene-half: shows the rendered foam over a teal pond background.
vec3 renderScene(vec2 px) {
  vec3 col = BG_DEEP;
  float aa = RING_AA_PX;
  for (int i = 0; i < MAX_DISKS; i++) {
    if (i >= u_count) break;
    vec4 dk = u_disks[i];
    vec2 d = px - dk.xy;
    vec2 nd = d / max(length(d), 1e-3);
    float pd = sdRippleSource(d, dk.z, dk.w, u_notch[i]);
    // The disk itself (a pad/lotus stand-in).
    if (pd < 0.0) col = mix(col, DISK, 1.0 - smoothstep(-aa, 0.0, pd));
    // Foam collar pinned at the outline: thin band just inside, width
    // jittered by per-source FBM so the rim doesn't read as a perfect circle.
    float fw = FOAM_PX
             + (fbm(nd * FOAM_FREQ
                    + vec2(u_seed[i], u_time * FOAM_SPEED)) - 0.5)
               * 2.0 * FOAM_VAR;
    if (pd < fw + aa) {
      float foam = 1.0 - smoothstep(fw - aa, fw + aa, pd);
      col = mix(col, FOAM, foam);
    }
  }
  return col;
}

// SDF-half: the signed-distance field the production shader is sampling,
// false-coloured so the foam band and the rim isoline are visible.
vec3 renderSdf(vec2 px) {
  // Min over all sources so overlapping disks read as the union.
  float pdMin = 1e9;
  vec2 ndMin = vec2(1, 0);
  float seedMin = 0.0;
  for (int i = 0; i < MAX_DISKS; i++) {
    if (i >= u_count) break;
    vec4 dk = u_disks[i];
    vec2 d = px - dk.xy;
    float pd = sdRippleSource(d, dk.z, dk.w, u_notch[i]);
    if (pd < pdMin) {
      pdMin = pd;
      ndMin = d / max(length(d), 1e-3);
      seedMin = u_seed[i];
    }
  }
  // Outside the disk: grayscale ramp from far to rim.
  // Inside the disk: also a ramp, slightly bluer, so the carved-notch wedge
  // is visible too.
  vec3 col;
  if (pdMin >= 0.0) {
    float t = 1.0 - clamp(pdMin / BAND_PX, 0.0, 1.0);
    col = mix(SDF_LO, SDF_HI, t);
  } else {
    float t = clamp(-pdMin / BAND_PX, 0.0, 1.0);
    col = mix(SDF_HI, DISK, t);
  }
  // pd = 0 isoline (the rim).
  float aa = fwidth(pdMin);
  float rim = 1.0 - smoothstep(0.0, aa * 1.5, abs(pdMin));
  col = mix(col, RIM_LINE, rim);
  // The exact band that becomes foam.
  float fw = FOAM_PX
           + (fbm(ndMin * FOAM_FREQ
                  + vec2(seedMin, u_time * FOAM_SPEED)) - 0.5)
             * 2.0 * FOAM_VAR;
  if (pdMin > 0.0 && pdMin < fw) {
    col = mix(col, FOAM_BAND, 0.55);
  }
  return col;
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  bool right = v_uv.x >= 0.5;
  vec3 col = right ? renderSdf(px) : renderScene(px);

  // Centre divider.
  float dx = abs(v_uv.x - 0.5) * u_res.x;
  float aa = fwidth(v_uv.x) * u_res.x;
  float line = 1.0 - smoothstep(0.5, 1.5, dx / max(aa, 1e-3));
  col = mix(col, DIVIDER, line * 0.45);

  o = vec4(col, 1.0);
}
