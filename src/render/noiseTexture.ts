// Tileable 2D noise baked once at startup and bound to a reserved texture unit
// so every shader can sample it instead of computing FBM per pixel. Replaces
// the per-pixel shFbm/fbm/n_fbm calls in shadow.glsl, water.frag.glsl and the
// (now-deleted) refract pass.
//
// Channel layout, all stored 0..255 as RGBA8:
//   R, G  curl-noise vector field (0.5 = zero); divergence-free,
//         |v| <= ~1 after normalization. Replaces the FBM-difference disp
//         in shadow.glsl (shadowWavyUV) and water.frag.glsl (ambient refract).
//   B     scalar value FBM, range ~0..0.875 (matches the GLSL fbm() output
//         used by water.frag.glsl for foam/crest width variation).
//   A     unused (kept 255 so the texture reads opaque in any debug viewer).
//
// Filter LINEAR, wrap REPEAT. The pattern tiles exactly across [0,1) UV.

// Reserved texture unit: every renderer that samples u_noise calls
// gl.uniform1i(loc, NOISE_TEX_UNIT). Nothing else binds here.
export const NOISE_TEX_UNIT = 7;

const SIZE = 512;
// Three octaves at lacunarity 2, gain 0.5 (matches noise.glsl FBM_LACUNARITY/
// FBM_GAIN). Lattice cells per period chosen so each octave fits the texture
// period an integer number of times -> the FBM tiles exactly.
const OCT_CELLS = [8, 16, 32] as const;
const FBM_GAIN = 0.5;

// Mirror n_hash from src/render/shaders/noise.glsl. Computed in floats to
// match GLSL precision behaviour closely enough; the exact bit-for-bit
// output doesn't matter — we just want a stable, well-distributed value
// noise pattern with the same statistical character.
function nHash(ix: number, iy: number): number {
  let px = ix * 123.34;
  let py = iy * 456.21;
  px -= Math.floor(px);
  py -= Math.floor(py);
  const dot = px * (px + 45.32) + py * (py + 45.32);
  px += dot;
  py += dot;
  const v = px * py;
  return v - Math.floor(v);
}

// Tileable value noise: hash the integer lattice with indices wrapped mod
// `cells`, so the noise pattern repeats exactly every `cells` units.
function vnoise(u: number, v: number, cells: number): number {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const ix0 = ((ix % cells) + cells) % cells;
  const iy0 = ((iy % cells) + cells) % cells;
  const ix1 = (ix0 + 1) % cells;
  const iy1 = (iy0 + 1) % cells;
  const h00 = nHash(ix0, iy0);
  const h10 = nHash(ix1, iy0);
  const h01 = nHash(ix0, iy1);
  const h11 = nHash(ix1, iy1);
  const a = h00 + (h10 - h00) * sx;
  const b = h01 + (h11 - h01) * sx;
  return a + (b - a) * sy;
}

function fbm(u: number, v: number): number {
  let val = 0;
  let amp = FBM_GAIN;
  for (const cells of OCT_CELLS) {
    val += amp * vnoise(u, v, cells);
    amp *= FBM_GAIN;
  }
  return val;
}

// 2D curl of a scalar potential field phi: (dphi/dy, -dphi/dx). Central
// differences across one texel; values are normalized to ~[-1,1] after the
// whole grid is computed (see `normalize` step below). Wrap UVs with REPEAT
// so the gradients tile too.
function curlAt(u: number, v: number, eps: number): [number, number] {
  const wrap = (x: number) => x - Math.floor(x);
  const dphi_dx =
    (fbm(wrap(u + eps), v) - fbm(wrap(u - eps + 1), v)) / (2 * eps);
  const dphi_dy =
    (fbm(u, wrap(v + eps)) - fbm(u, wrap(v - eps + 1))) / (2 * eps);
  return [dphi_dy, -dphi_dx];
}

export function buildNoiseTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + NOISE_TEX_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, tex);

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const eps = 1 / SIZE;

  // First pass: compute curl + fbm, track max |curl| component so we can
  // normalize curl to ~[-1, 1] before quantizing to 8 bits.
  const curl = new Float32Array(SIZE * SIZE * 2);
  const fbmBuf = new Float32Array(SIZE * SIZE);
  let maxAbs = 1e-6;
  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const [cx, cy] = curlAt(u, v, eps);
      curl[(y * SIZE + x) * 2 + 0] = cx;
      curl[(y * SIZE + x) * 2 + 1] = cy;
      fbmBuf[y * SIZE + x] = fbm(u, v);
      const m = Math.max(Math.abs(cx), Math.abs(cy));
      if (m > maxAbs) maxAbs = m;
    }
  }

  for (let i = 0; i < SIZE * SIZE; i++) {
    const cx = curl[i * 2 + 0] / maxAbs; // -> ~[-1, 1]
    const cy = curl[i * 2 + 1] / maxAbs;
    const b = fbmBuf[i]; // ~[0, 0.875]
    pixels[i * 4 + 0] = Math.round((cx * 0.5 + 0.5) * 255);
    pixels[i * 4 + 1] = Math.round((cy * 0.5 + 0.5) * 255);
    pixels[i * 4 + 2] = Math.round(Math.min(1, b) * 255);
    pixels[i * 4 + 3] = 255;
  }

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    SIZE,
    SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  // Restore default unit so subsequent gl.activeTexture(TEXTURE0) calls
  // elsewhere don't accidentally rebind to the wrong unit on first draw.
  gl.activeTexture(gl.TEXTURE0);
  return tex;
}

// Bind `u_noise` (if declared) on `prog` to the reserved noise texture unit.
// Safe on programs that don't declare or actively use the uniform: the
// getUniformLocation returns null and uniform1i becomes a no-op.
// Call once per program at construction; uniform values persist per-program.
export function bindNoiseUniform(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
): void {
  const loc = gl.getUniformLocation(prog, "u_noise");
  if (!loc) return;
  const prev = gl.getParameter(gl.CURRENT_PROGRAM);
  gl.useProgram(prog);
  gl.uniform1i(loc, NOISE_TEX_UNIT);
  gl.useProgram(prev);
}
