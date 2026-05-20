import type { FigureModule, Sketch } from "@/figures/types";
import { LilypadRenderer } from "@/render/LilypadRenderer";
import { LILYPAD_INST_FLOATS } from "@/sim/Lilypads";
import { PALETTE as P } from "@/figures/palette";

class LilypadWiresSketch implements Sketch {
  animated = false;
  private gl: WebGL2RenderingContext;
  private renderer: LilypadRenderer;
  private dummyTex: WebGLTexture;
  private data = new Float32Array(LILYPAD_INST_FLOATS);
  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.renderer = new LilypadRenderer(gl);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.dummyTex = tex;
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    const d = this.data;
    d[0] = w / 2;
    d[1] = h / 2;
    d[2] = Math.min(w, h) * 0.42;
    d[3] = 0;
    d[4] = 0.18;
    d[5] = 0;
    d[6] = 0.4;
    d[7] = 0.6;
    d[8] = 0.45;
  }

  frame() {
    const gl = this.gl;
    const { w, h } = this;
    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (w === 0 || h === 0) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.renderer.draw(this.data, 1, w, h, 0, this.dummyTex, w, h);
    this.renderer.drawWires(this.data, 1, w, h, 0, P.wireGL);
    gl.disable(gl.BLEND);
  }

  dispose() {
    this.renderer.dispose();
    this.gl.deleteTexture(this.dummyTex);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new LilypadWiresSketch(host.gl);
  },
};

export default mod;
