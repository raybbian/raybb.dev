import { createProgram } from "@/lib/gl";
import WATER_VS from "@/render/shaders/water.vert.glsl";

// Single attributeless fullscreen-triangle program. The vertex shader
// (water.vert.glsl) reads gl_VertexID, so no buffer is bound — but a VAO
// must still exist for the WebGL2 spec.
//
// Sketches that paint a single shader over the panel (valueNoise,
// displacementNoise, koiPattern, koiSteps) instantiate one of these and
// pass a per-frame setup callback to bind uniforms.
//
// patternBaker.PatternBakeProgram composes this internally to share the
// program/VAO lifecycle.
export class FullscreenShader {
  readonly program: WebGLProgram;
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext, frag: string, vert: string = WATER_VS) {
    this.gl = gl;
    this.program = createProgram(gl, vert, frag);
    this.vao = gl.createVertexArray()!;
  }

  uniform(name: string): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(this.program, name);
  }

  // Binds the program and the empty VAO, runs the caller's uniform setup,
  // then issues the fullscreen draw and unbinds the VAO.
  draw(
    setup?: (gl: WebGL2RenderingContext, prog: WebGLProgram) => void,
  ): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    if (setup) setup(gl, this.program);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  // For callers (PatternBakeProgram) that want to issue multiple draws
  // sharing the program — bind once, draw N times.
  use(): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
  }

  drawTriangle(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
  }
}
