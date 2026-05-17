// Shared cast-shadow sampling, #include'd by every receiver. No
// #version/precision: inlined into shaders that declare both. `u_res` is owned
// by the including shader (not declared here). highp: the premultiplied terms
// below subtract near-equal O(1) values to ~0 on faded edges; mediump
// cancellation there leaves a noisy dark fringe. WebGL2 guarantees frag highp.
uniform highp sampler2D u_shadow; // RG = premultiplied (cov*height, coverage)
uniform vec2 u_sunDir;      // shadow-fall dir, logical px (screen down-right +)
uniform float u_shadowK;    // logical px the shadow slides per unit height gap
uniform float u_shadowDark; // applied by the receiver at the call site
uniform float u_shadowBias;
uniform float u_shadowFade;  // darkness lost per unit caster-height gap
uniform float u_recvHeight;  // this receiver's height in the shared scale [0,1]
uniform float u_shadowDebug; // DEBUG (toggle 'd'): >0.5 -> receivers show viz

// Heights are [0,1] CPU-side (0 = floor, 1 = tallest caster). The mask is
// pre-projected to the floor, so one tap offset by the receiver's own height
// places the shadow at the true depth gap. The mask is grown by the max
// projection (K*sunDir) and screen-pinned at its origin, so remap the
// screen-space coord into it. Returns the raw hit; receiver darkens.
float shadowHit(vec2 uv) {
  float off = u_shadowK * u_recvHeight; // >= 0, logical px down-sun
  vec2 raw = uv + vec2(u_sunDir.x * off / u_res.x,
                      -u_sunDir.y * off / u_res.y);
  vec2 den = u_res + u_shadowK * u_sunDir;
  vec2 s = vec2(raw.x * u_res.x / den.x,
                1.0 - (1.0 - raw.y) * u_res.y / den.y);
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

// DEBUG ONLY. Mirrors shadowHit: R=present, G=atten, B=final hit. With the
// fix B must be monotone (no band brighter than the interior just inside it).
vec3 shadowDebugRGB(vec2 uv) {
  float off = u_shadowK * u_recvHeight;
  vec2 raw = uv + vec2(u_sunDir.x * off / u_res.x,
                      -u_sunDir.y * off / u_res.y);
  vec2 den = u_res + u_shadowK * u_sunDir;
  vec2 s = vec2(raw.x * u_res.x / den.x,
                1.0 - (1.0 - raw.y) * u_res.y / den.y);
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
