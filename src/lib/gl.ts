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

// Unit-circle triangle fan (origin + rim pairs), interleaved x,y for GL.
export function unitCircleMesh(segments: number): Float32Array {
  const data: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    data.push(0, 0, Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1));
  }
  return new Float32Array(data);
}

// Binds tightly-packed per-instance float attributes (divisor 1) on the bound
// VAO/VBO. `attribs` is [name, size] in buffer order; returns floats/instance.
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
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(loc, 1);
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
