import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { FullscreenShader } from "@/figures/FullscreenShader";
import { PanTracker } from "@/figures/PanTracker";
import FS from "./shaders/displacementNoise.frag.glsl";

const NOISE_PER_CSS_PX = 1 / 60;

class DisplacementNoiseSketch implements Sketch {
  animated = true;

  private gl: WebGL2RenderingContext;
  private shader: FullscreenShader;
  private uUvScale: WebGLUniformLocation | null;
  private uPan: WebGLUniformLocation | null;
  private uTime: WebGLUniformLocation | null;
  private pan: PanTracker;

  private w = 0;
  private h = 0;
  private time = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new FullscreenShader(gl, FS);
    this.uUvScale = this.shader.uniform("u_uvScale");
    this.uPan = this.shader.uniform("u_pan");
    this.uTime = this.shader.uniform("u_time");
    this.pan = new PanTracker(NOISE_PER_CSS_PX);
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  pointer(p: PointerInfo) {
    this.pan.pointer(p);
  }

  frame(t: number) {
    this.time = t;
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.draw(() => {
      if (this.uUvScale)
        gl.uniform2f(this.uUvScale, w * NOISE_PER_CSS_PX, h * NOISE_PER_CSS_PX);
      if (this.uPan) gl.uniform2f(this.uPan, this.pan.panX, this.pan.panY);
      if (this.uTime) gl.uniform1f(this.uTime, this.time);
    });
  }

  dispose() {
    this.shader.dispose();
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new DisplacementNoiseSketch(host.gl);
  },
};

export default mod;
