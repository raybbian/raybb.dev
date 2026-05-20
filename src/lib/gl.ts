export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

// Triangle fan: origin + rim pair per segment, interleaved x,y.
export function unitCircleMesh(segments: number): Float32Array {
  const data: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    data.push(0, 0, Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1));
  }
  return new Float32Array(data);
}

// `attribs` is [name, size] in buffer order; returns floats/instance.
// Attributes the program doesn't declare (loc == -1) are skipped but still
// consume their stride slot, so one VBO layout can feed multiple programs.
export function bindInstancedFloatAttribs(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  attribs: [string, number][],
): number {
  const floats = attribs.reduce((s, [, n]) => s + n, 0);
  const stride = floats * 4;
  let offset = 0;
  for (const [name, size] of attribs) {
    const loc = gl.getAttribLocation(program, name);
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    offset += size * 4;
  }
  return floats;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link failed: ${log}`);
  }
  return prog;
}

// RGBA8 LINEAR/CLAMP offscreen render target. Sketches that capture a scene
// to texture (flatVsToon, waterRefract) reach for this instead of duplicating
// the framebuffer + texture + texImage2D dance.
export class OffscreenTarget {
  readonly fbo: WebGLFramebuffer;
  readonly tex: WebGLTexture;
  width = 0;
  height = 0;
  private gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.fbo = gl.createFramebuffer()!;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // Allocates / reallocates the backing storage. Returns true when the size
  // actually changed so callers can skip re-binding when it didn't.
  resize(w: number, h: number): boolean {
    if (w === this.width && h === this.height) return false;
    const gl = this.gl;
    this.width = w;
    this.height = h;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.tex);
  }
}
