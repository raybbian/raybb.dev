import { createProgram } from "@/lib/gl";
import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import VS from "@/render/shaders/water.vert.glsl";
import FS from "./shaders/valueNoise.frag.glsl";

// ~60 CSS pixels per integer lattice step — matches the fish-scale blob
// size used by the koi-pattern and koi-steps figures so the noise looks
// the same density across the post.
const NOISE_PER_CSS_PX = 1 / 60;

class ValueNoiseSketch implements Sketch {
  animated = false;

  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private uUvScale: WebGLUniformLocation;
  private uPan: WebGLUniformLocation;
  private vao: WebGLVertexArrayObject;

  private w = 0;
  private h = 0;
  private panX = 0;
  private panY = 0;
  private lastPx = 0;
  private lastPy = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.uUvScale = gl.getUniformLocation(this.prog, "u_uvScale")!;
    this.uPan = gl.getUniformLocation(this.prog, "u_pan")!;
    // water.vert.glsl is attributeless; bind a VAO so the WebGL2 spec is happy.
    this.vao = gl.createVertexArray()!;
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") {
      this.lastPx = p.x;
      this.lastPy = p.y;
    } else if (p.type === "move" && p.down) {
      this.panX -= (p.x - this.lastPx) * NOISE_PER_CSS_PX;
      this.panY -= (p.y - this.lastPy) * NOISE_PER_CSS_PX;
      this.lastPx = p.x;
      this.lastPy = p.y;
    }
  }

  frame() {
    const { gl, w, h, panX, panY } = this;
    if (w === 0 || h === 0) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uUvScale, w * NOISE_PER_CSS_PX, h * NOISE_PER_CSS_PX);
    gl.uniform2f(this.uPan, panX, panY);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new ValueNoiseSketch(host.gl);
  },
};

export default mod;
