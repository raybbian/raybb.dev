import type { FigureModule, FigureView, PointerInfo, Sketch } from "@/figures/types";
import { FullscreenShader } from "@/figures/FullscreenShader";
import { PanTracker } from "@/figures/PanTracker";
import FS from "./shaders/valueNoise.frag.glsl";

// ~60 CSS pixels per integer lattice step — matches the fish-scale blob
// size used by the koi-pattern and koi-steps figures so the noise looks
// the same density across the post.
// Noise cells per world unit: 1/60 per CSS px at the 640px desktop width,
// restated in units so the field shows the same cell count at every size.
const NOISE_PER_UNIT = 1 / 135;

class ValueNoiseSketch implements Sketch {
  animated = false;

  private gl: WebGL2RenderingContext;
  private shader: FullscreenShader;
  private uUvScale: WebGLUniformLocation | null;
  private uPan: WebGLUniformLocation | null;
  private pan: PanTracker;

  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.shader = new FullscreenShader(gl, FS);
    this.uUvScale = this.shader.uniform("u_uvScale");
    this.uPan = this.shader.uniform("u_pan");
    this.pan = new PanTracker(NOISE_PER_UNIT);
  }

  setTheme() {}

  // Fullscreen shader: noise period is in `1/CSS px`, already canvas-relative.
  resize({ w, h }: FigureView) {
    this.w = w;
    this.h = h;
  }

  pointer(p: PointerInfo) {
    this.pan.pointer(p);
  }

  frame() {
    const { gl, w, h } = this;
    if (w === 0 || h === 0) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.draw(() => {
      if (this.uUvScale)
        gl.uniform2f(this.uUvScale, w * NOISE_PER_UNIT, h * NOISE_PER_UNIT);
      if (this.uPan) gl.uniform2f(this.uPan, this.pan.panX, this.pan.panY);
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
    return new ValueNoiseSketch(host.gl);
  },
};

export default mod;
