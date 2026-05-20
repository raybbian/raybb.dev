import { FullscreenShader } from "@/figures/FullscreenShader";
import type { KoiColors } from "@/sim/koiPattern";

// Shared pattern-bake program. Both `FishRenderer.setPalettes` (full body UV
// shader, baking into a texture) and `uvMapping`'s windowed-UV bake (rendering
// directly to a hidden canvas) own one of these instead of repeating the
// "compile pattern shader + attributeless VAO + set base/mid/accent/seed"
// boilerplate.
//
// The caller owns the framebuffer + viewport — this class only owns the
// program and the empty VAO that drives the fullscreen-triangle vertex
// shader.
export class PatternBakeProgram {
  private gl: WebGL2RenderingContext;
  private shader: FullscreenShader;
  private uBase: WebGLUniformLocation | null;
  private uMid: WebGLUniformLocation | null;
  private uAccent: WebGLUniformLocation | null;
  private uSeed: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext, vert: string, frag: string) {
    this.gl = gl;
    this.shader = new FullscreenShader(gl, frag, vert);
    this.uBase = this.shader.uniform("u_base");
    this.uMid = this.shader.uniform("u_mid");
    this.uAccent = this.shader.uniform("u_accent");
    this.uSeed = this.shader.uniform("u_seed");
  }

  use(): void {
    this.shader.use();
  }

  setPalette(p: KoiColors): void {
    const gl = this.gl;
    const rgb3 = (c: number[]): [number, number, number] => [c[0], c[1], c[2]];
    if (this.uBase) gl.uniform3fv(this.uBase, rgb3(p.base));
    if (this.uMid) gl.uniform3fv(this.uMid, rgb3(p.mid));
    if (this.uAccent) gl.uniform3fv(this.uAccent, rgb3(p.accent));
    if (this.uSeed) gl.uniform2fv(this.uSeed, p.seed);
  }

  getUniformLocation(name: string): WebGLUniformLocation | null {
    return this.shader.uniform(name);
  }

  // Draws the fullscreen triangle. Caller has already bound the destination
  // framebuffer and set the viewport.
  bake(): void {
    this.shader.drawTriangle();
  }

  dispose(): void {
    this.shader.dispose();
  }
}
