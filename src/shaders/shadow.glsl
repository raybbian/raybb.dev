// Shared cast-shadow sampling — #include'd by every receiver (fish body, fins,
// lilypad, water) so the shadow model lives in one place. No #version/precision: this
// chunk is inlined into shaders that already declare both. `u_res` is NOT
// declared here (water uses it pervasively); the including shader owns it.
// highp: the premultiplied atten below subtracts two near-equal O(1) terms
// whose result is ~0 on heavily-faded edges — mediump cancellation there
// leaves a noisy dark fringe (a faint outline). WebGL2 guarantees fragment
// highp.
uniform highp sampler2D u_shadow; // RG = premultiplied (cov*height, coverage)
uniform vec2 u_sunDir;      // shadow-fall dir, logical px (screen down-right +)
uniform float u_shadowK;    // logical px the shadow slides per unit height gap
uniform float u_shadowDark; // applied by the receiver at the call site
uniform float u_shadowBias;
uniform float u_shadowFade;  // darkness lost per unit caster-height gap
uniform float u_recvHeight;  // this receiver's height in the shared scale [0,1]

// Heights are normalized to [0,1] CPU-side (0 = pond floor, 1 = tallest
// caster). The mask is pre-projected to the floor, so one tap offset by this
// receiver's own height exactly places the shadow at the true depth gap. The
// mask is grown by the max projection (K*sunDir) on the far side, screen
// pinned at its origin, so remap the screen-space coord into it. The mask is
// premultiplied: a resolved edge texel is (cov*H, cov), so h = R/G recovers
// the TRUE caster height (un-diluted, constant across the edge -> correct gap,
// no dark rim) while G is the MSAA-smooth coverage that already IS the
// anti-aliased edge (no read-side fwidth/threshold AA). Returns the raw hit;
// the receiver applies its own darkening.
float shadowHit(vec2 uv) {
  float off = u_shadowK * u_recvHeight; // >= 0, logical px down-sun
  vec2 raw = uv + vec2(u_sunDir.x * off / u_res.x,
                      -u_sunDir.y * off / u_res.y);
  vec2 den = u_res + u_shadowK * u_sunDir;
  vec2 s = vec2(raw.x * u_res.x / den.x,
                1.0 - (1.0 - raw.y) * u_res.y / den.y);
  highp vec2 m = texture(u_shadow, s).rg; // (cov*H, cov), premultiplied
  // h = R/G recovers the true height, but the divide is 8-bit-noisy at low
  // coverage; only the bias test needs it, and that saturates (vis=1) for any
  // real depth gap, so the noise there is invisible.
  highp float h = m.r / max(m.g, 1.0 / 255.0);
  float vis = smoothstep(u_shadowBias * 0.5, u_shadowBias, h - u_recvHeight);
  // Depth fade in PREMULTIPLIED space: cov*atten = cov - fade*(cov*H -
  // cov*recvH) = G*(1 + fade*recvH) - fade*R. No R/G divide, so it LINEAR-
  // filters exactly across the AA edge -> no dark fringe on faded shadows.
  highp float covAtten = clamp(m.g * (1.0 + u_shadowFade * u_recvHeight)
                               - u_shadowFade * m.r, 0.0, m.g);
  return vis * covAtten;
}
