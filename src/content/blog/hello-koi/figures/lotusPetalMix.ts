import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { LotusRenderer } from "@/render/LotusRenderer";
import { LOTUS_INST_FLOATS } from "@/sim/Lotuses";
import { createProgram } from "@/lib/gl";
import { PALETTE as P } from "@/figures/palette";

const SLIDER_BAND = 44;
const SLIDER_PAD_X = 28;
const TRACK_H = 4;
const KNOB_R = 9;
const HIT_PAD = 10;
const TRACK_COLOR: [number, number, number, number] = [0.6, 0.7, 0.8, 0.4];
const KNOB_COLOR: [number, number, number, number] = [0.18, 0.83, 0.75, 1.0];

const RECT_VS = `#version 300 es
uniform vec2 u_res;
uniform vec2 u_rectPxMin;
uniform vec2 u_rectPxMax;
out vec2 v_uv;
void main() {
  vec2 c[6] = vec2[6](vec2(0.0,0.0), vec2(1.0,0.0), vec2(1.0,1.0),
                      vec2(0.0,0.0), vec2(1.0,1.0), vec2(0.0,1.0));
  v_uv = c[gl_VertexID];
  vec2 px = mix(u_rectPxMin, u_rectPxMax, c[gl_VertexID]);
  vec2 clip = vec2(px.x / u_res.x * 2.0 - 1.0,
                   1.0 - px.y / u_res.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

// u_circle > 0.5 -> disc inscribed in the quad (analytic AA via fwidth);
// otherwise the whole rect fills flat.
const RECT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform vec4 u_color;
uniform float u_circle;
out vec4 o;
void main() {
  float a = u_color.a;
  if (u_circle > 0.5) {
    float d = length(v_uv * 2.0 - 1.0) - 1.0;
    float aa = fwidth(d);
    a *= 1.0 - smoothstep(-aa, aa, d);
    if (a <= 0.0) discard;
  }
  o = vec4(u_color.rgb, a);
}`;

class LotusPetalMixSketch implements Sketch {
  animated = false;
  private gl: WebGL2RenderingContext;
  private renderer: LotusRenderer;
  private rectProg: WebGLProgram;
  private rectVao: WebGLVertexArrayObject;
  private rectResLoc: WebGLUniformLocation;
  private rectMinLoc: WebGLUniformLocation;
  private rectMaxLoc: WebGLUniformLocation;
  private rectColorLoc: WebGLUniformLocation;
  private rectCircleLoc: WebGLUniformLocation;
  private petalData = new Float32Array(LOTUS_INST_FLOATS);
  private w = 0;
  private h = 0;
  private bulge = 0.55;
  private dragging = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.renderer = new LotusRenderer(gl);
    this.rectProg = createProgram(gl, RECT_VS, RECT_FS);
    this.rectResLoc = gl.getUniformLocation(this.rectProg, "u_res")!;
    this.rectMinLoc = gl.getUniformLocation(this.rectProg, "u_rectPxMin")!;
    this.rectMaxLoc = gl.getUniformLocation(this.rectProg, "u_rectPxMax")!;
    this.rectColorLoc = gl.getUniformLocation(this.rectProg, "u_color")!;
    this.rectCircleLoc = gl.getUniformLocation(this.rectProg, "u_circle")!;
    this.rectVao = gl.createVertexArray()!;
  }

  setTheme(theme: "light" | "dark") {
    this.renderer.setTheme(theme === "light" ? 1 : 0);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    const petalH = Math.max(1, h - SLIDER_BAND);
    const len = Math.min(w, petalH) * 0.5625; // 1.25x the original 0.45
    const cx = w * 0.5 - len * 0.5;
    const cy = petalH * 0.5;
    const d = this.petalData;
    d[0] = cx;
    d[1] = cy;
    d[2] = 0;
    d[3] = len;
    d[4] = len * 0.65;
    d[5] = len * 0.05;
    d[6] = 0.94; d[7] = 0.62; d[8] = 0.78;
    d[9] = 0.32; d[10] = 0.62; d[11] = 0.88;
    d[12] = 1.0;
  }

  private trackGeom() {
    const y = this.h - SLIDER_BAND / 2;
    const x0 = SLIDER_PAD_X;
    const x1 = this.w - SLIDER_PAD_X;
    return { y, x0, x1, w: Math.max(1, x1 - x0) };
  }

  pointer(p: PointerInfo) {
    const { y, x0, x1, w } = this.trackGeom();
    if (p.type === "down" && Math.abs(p.y - y) < SLIDER_BAND / 2 + HIT_PAD) {
      this.dragging = true;
    } else if (p.type === "up") {
      this.dragging = false;
    }
    if (this.dragging && p.down) {
      const cx = Math.min(x1, Math.max(x0, p.x));
      this.bulge = (cx - x0) / w;
    }
  }

  private drawRect(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    color: [number, number, number, number],
    circle = false,
  ) {
    const gl = this.gl;
    gl.uniform2f(this.rectMinLoc, xMin, yMin);
    gl.uniform2f(this.rectMaxLoc, xMax, yMax);
    gl.uniform4f(this.rectColorLoc, color[0], color[1], color[2], color[3]);
    gl.uniform1f(this.rectCircleLoc, circle ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private drawSlider() {
    const gl = this.gl;
    const { y, x0, x1, w } = this.trackGeom();
    gl.useProgram(this.rectProg);
    gl.uniform2f(this.rectResLoc, this.w, this.h);
    gl.bindVertexArray(this.rectVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawRect(x0, y - TRACK_H / 2, x1, y + TRACK_H / 2, TRACK_COLOR);
    const kx = x0 + this.bulge * w;
    this.drawRect(
      kx - KNOB_R,
      y - KNOB_R,
      kx + KNOB_R,
      y + KNOB_R,
      KNOB_COLOR,
      true,
    );
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  frame() {
    const gl = this.gl;
    const { w, h } = this;
    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (w === 0 || h === 0) return;
    this.renderer.setBulge(this.bulge);
    this.renderer.draw(this.petalData, 1, w, h, 0);
    this.drawSlider();
  }

  dispose() {
    const gl = this.gl;
    this.renderer.dispose();
    gl.deleteProgram(this.rectProg);
    gl.deleteVertexArray(this.rectVao);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new LotusPetalMixSketch(host.gl);
  },
};

export default mod;
