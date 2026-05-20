// Shared cast-shadow sampling, #include'd by every receiver. No
// #version/precision: inlined into shaders that declare both. `u_res` is owned
// by the including shader (not declared here). highp: the premultiplied terms
// below subtract near-equal O(1) values to ~0 on faded edges; mediump
// cancellation there leaves a noisy dark fringe. WebGL2 guarantees frag highp.
uniform highp sampler2D u_shadow; // RG = premultiplied (cov*height, coverage)
uniform vec2 u_sunDir;      // shadow-fall dir, logical px (theme-lerped: down-right in light, down-left in dark)
uniform vec2 u_shadowMargin; // max one-side floor projection, logical px: x grown BOTH sides, y on the bottom
uniform float u_shadowK;    // logical px the shadow slides per unit height gap
uniform float u_shadowDark; // applied by the receiver at the call site
uniform float u_shadowBias;
uniform float u_shadowFade;  // darkness lost per unit caster-height gap
uniform float u_recvHeight;  // this receiver's height in the shared scale [0,1]
uniform float u_surfaceH;    // air/water interface, shared scale (= WATER_H, set CPU-side)
uniform float u_shadowDebug; // DEBUG (toggle 'd'): >0.5 -> receivers show viz

// Heights are [0,1] CPU-side (0 = floor, 1 = tallest caster). The mask is
// pre-projected to the floor, so one tap offset by the receiver's own height
// places the shadow at the true depth gap. Screen uv (y-up, [0,1]) -> grown-
// mask sample coord: shift the lookup up-sun by the receiver's own height (net
// displacement K*(casterH-recvH)), then remap screen space into the mask. X is
// grown by u_shadowMargin.x on EACH side with the origin shifted right by it
// (the sun mirrors with theme); Y grows on the bottom only.
vec2 shadowTexCoord(vec2 uv) {
  float off = u_shadowK * u_recvHeight; // >= 0, logical px down-sun
  vec2 raw = uv + vec2(u_sunDir.x * off / u_res.x,
                      -u_sunDir.y * off / u_res.y);
  float bx = u_res.x + 2.0 * u_shadowMargin.x;
  float by = u_res.y + u_shadowMargin.y;
  return vec2((raw.x * u_res.x + u_shadowMargin.x) / bx,
              1.0 - (1.0 - raw.y) * u_res.y / by);
}

// Returns the raw hit; receiver darkens.
float shadowHit(vec2 uv) {
  vec2 s = shadowTexCoord(uv);
  // bias/fade MUST read the exact texel (texelFetch). LINEAR-filtering the
  // height ramps it across the silhouette; with "closer = darker" fade that
  // sweeps gap through atten's max and the product spikes to full dark -> a
  // constant-colour rim. Per-texel height is constant per caster region.
  ivec2 sz = textureSize(u_shadow, 0);
  ivec2 tx = clamp(ivec2(s * vec2(sz)), ivec2(0), sz - 1);
  highp vec2 mnf = texelFetch(u_shadow, tx, 0).rg;
  highp float h = mnf.r / max(mnf.g, 1.0 / 255.0); // R/G recovers true height
  float gap = h - u_recvHeight;
  float present = step(0.5 / 255.0, mnf.g) * step(u_shadowBias, gap);
  float atten = clamp(1.0 - max(gap, 0.0) * u_shadowFade, 0.0, 1.0);
  // Only coverage stays LINEAR -> the lone spatial ramp is monotone, so the
  // product can't overshoot (no rim).
  float covLin = texture(u_shadow, s).g;
  return covLin * present * atten;
}

// Refraction-disturbed variant. Perturbs the lookup by `dispPx` (logical px)
// scaled by the recovered caster height: the mask is projected to the floor,
// so a tall caster (lilypad/lotus) sits under a long column of rippling water
// and its shadow should wobble far more than a near-floor caster's. The
// pre-tap mirrors shadowHit's remap purely to read that height; the actual
// sample still goes through unmodified shadowHit, so the texelFetch-height /
// LINEAR-coverage split (see above) stays intact.
float shadowHitWavy(vec2 uv, vec2 dispPx) {
  vec2 s = shadowTexCoord(uv);
  ivec2 sz = textureSize(u_shadow, 0);
  ivec2 tx = clamp(ivec2(s * vec2(sz)), ivec2(0), sz - 1);
  highp vec2 mnf = texelFetch(u_shadow, tx, 0).rg;
  highp float h = mnf.r / max(mnf.g, 1.0 / 255.0);
  float k = clamp(h, 0.0, 1.0) * step(0.5 / 255.0, mnf.g);
  return shadowHit(uv + dispPx * k / u_res);
}

// Procedural "wavy" shadow. An underwater receiver (fish) carries no
// refraction texture of its own, and the later water pass shifts receiver +
// shadow together, so the cast silhouette can't churn relative to the body.
// Reproduce the water pass's ambient refraction locally here instead. Noise is
// self-named (sh*) so it never collides with a host shader's own hash/fbm;
// kept in lockstep with refract.frag.glsl.
const float SHADOW_WAVY_FREQ = 3.0;
const float SHADOW_WAVY_SPEED = 0.15;

// Floor so near-coplanar fish->fish still shimmer faintly: the water pass
// shifts body + baked shadow together, so a hard 0 would freeze the cast
// silhouette rigidly to the body.
const float SHADOW_WAVY_MIN = 0.12;

float shHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float shVnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(shHash(i), shHash(i + vec2(1, 0)), u.x),
             mix(shHash(i + vec2(0, 1)), shHash(i + vec2(1, 1)), u.x), u.y);
}
float shFbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { v += a * shVnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

// The perturbed lookup coord shared by the real sample and the debug viz, so
// the overlay always matches what's drawn. `uv` = receiver fragment in [0,1]
// (gl_FragCoord/u_fragRes). `pxGain` = peak churn in logical px. The
// refraction must be read at the point on the WATER the shadowing ray actually
// pierced, NOT directly above the receiver: the occluder floats ~at the
// surface, so that point is the receiver offset toward it by the
// caster<->receiver height gap (same affine sun projection shadowHit uses). A
// pre-tap recovers the caster height -- used both for that gap and to gate the
// churn magnitude by the air/water column (u_surfaceH): a fish
// shadowing a near-coplanar fish barely churns; a lotus/lilypad still does
// fully.
vec2 shadowWavyUV(vec2 uv, float time, float pxGain) {
  // Pre-tap the mask at the unperturbed lookup to recover the caster height.
  vec2 s = shadowTexCoord(uv);
  ivec2 sz = textureSize(u_shadow, 0);
  ivec2 tx = clamp(ivec2(s * vec2(sz)), ivec2(0), sz - 1);
  highp vec2 mnf = texelFetch(u_shadow, tx, 0).rg;
  highp float h = mnf.r / max(mnf.g, 1.0 / 255.0);
  float present = step(0.5 / 255.0, mnf.g);
  float gap = max(h - u_recvHeight, 0.0) * present;

  // The ray crossed the surface up the sun line from the receiver by the
  // height gap; sample the refraction THERE (shadowHit's projection sign).
  vec2 wuv = uv + vec2(u_sunDir.x, -u_sunDir.y) * (u_shadowK * gap) / u_res;
  vec2 px = vec2(wuv.x, 1.0 - wuv.y) * u_res;
  vec2 np = px / u_res.y * SHADOW_WAVY_FREQ;
  float t = time * SHADOW_WAVY_SPEED;
  vec2 disp = vec2(
    shFbm(np + vec2(t, 0.0)) - shFbm(np - vec2(t, 0.0)),
    shFbm(np.yx + vec2(0.0, t)) - shFbm(np.yx - vec2(0.0, t)));

  // Churn scales with the water column the occluding ray traverses BELOW the
  // refracting boundary, not the receiver's absolute depth. The boundary is
  // the surface for an air caster, the caster itself for a submerged one:
  // clamp at the surface. Ratio is 1 for air casters (pxGain already encodes
  // today's full submergence churn -> no lotus/lilypad regression) and tends
  // to 0 as a fish caster nears the receiver's depth.
  float colTop = min(h, u_surfaceH);
  float col = clamp((colTop - u_recvHeight) /
                    max(u_surfaceH - u_recvHeight, 1e-3), 0.0, 1.0);
  float gain = mix(SHADOW_WAVY_MIN, 1.0, col);
  return uv + disp * pxGain * gain * present / u_res;
}

// Real sample: the unmodified shadowHit at the perturbed coord (texelFetch /
// LINEAR split intact).
float shadowHitWavyAuto(vec2 uv, float time, float pxGain) {
  return shadowHit(shadowWavyUV(uv, time, pxGain));
}

// Submergence-scaled wrapper for underwater receivers: a deeper fish (`depth`
// = submergence, 0..1) sits under a taller, wavier water column, so its cast
// shadow churns harder. Single source for the px magnitude + depth ramp so
// fish.frag/ellipse.frag carry no mirrored tuning.
const float SHADOW_WAVY_PX = 30.0;     // base churn (shallow fish)
const float SHADOW_WAVY_DEPTH = 2.0;   // extra churn per unit submergence

float shadowWavyGain(float depth) {
  return SHADOW_WAVY_PX * (1.0 + SHADOW_WAVY_DEPTH * clamp(depth, 0.0, 1.0));
}

float shadowHitWavyDepth(vec2 uv, float time, float depth) {
  return shadowHitWavyAuto(uv, time, shadowWavyGain(depth));
}

// DEBUG ONLY. Mirrors shadowHit: R=present, G=atten, B=final hit. With the
// fix B must be monotone (no band brighter than the interior just inside it).
vec3 shadowDebugRGB(vec2 uv) {
  vec2 s = shadowTexCoord(uv);
  ivec2 sz = textureSize(u_shadow, 0);
  ivec2 tx = clamp(ivec2(s * vec2(sz)), ivec2(0), sz - 1);
  highp vec2 mnf = texelFetch(u_shadow, tx, 0).rg;
  highp float h = mnf.r / max(mnf.g, 1.0 / 255.0);
  float gap = h - u_recvHeight;
  float present = step(0.5 / 255.0, mnf.g) * step(u_shadowBias, gap);
  float atten = clamp(1.0 - max(gap, 0.0) * u_shadowFade, 0.0, 1.0);
  float covLin = texture(u_shadow, s).g;
  return vec3(present, atten, covLin * present * atten);
}

// DEBUG ONLY. Same breakdown as shadowDebugRGB but at the perturbed coord, so
// the overlay matches what shadowHitWavyDepth actually draws on the fish.
// Reuses both the shared perturbation and the base debug -> no mirrored math.
vec3 shadowDebugWavyDepth(vec2 uv, float time, float depth) {
  return shadowDebugRGB(shadowWavyUV(uv, time, shadowWavyGain(depth)));
}
