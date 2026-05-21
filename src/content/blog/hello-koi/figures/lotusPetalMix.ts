import type { FigureModule, FigureTheme, PointerInfo, Sketch } from "@/figures/types";
import { LotusRenderer } from "@/render/LotusRenderer";
import { LOTUS_INST_FLOATS } from "@/sim/Lotuses";
import { createProgram } from "@/lib/gl";
import { PALETTE as P } from "@/figures/palette";
import { SliderUI } from "@/figures/SliderUI";

const TRACK_H = 4;
const KNOB_RADIUS = 9;
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
  private slider: SliderUI;
  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext, theme: FigureTheme) {
    this.gl = gl;
    this.renderer = new LotusRenderer(gl);
    this.renderer.setTheme(theme === "light" ? 1 : 0);
    this.rectProg = createProgram(gl, RECT_VS, RECT_FS);
    this.rectResLoc = gl.getUniformLocation(this.rectProg, "u_res")!;
    this.rectMinLoc = gl.getUniformLocation(this.rectProg, "u_rectPxMin")!;
    this.rectMaxLoc = gl.getUniformLocation(this.rectProg, "u_rectPxMax")!;
    this.rectColorLoc = gl.getUniformLocation(this.rectProg, "u_color")!;
    this.rectCircleLoc = gl.getUniformLocation(this.rectProg, "u_circle")!;
    this.rectVao = gl.createVertexArray()!;
    this.slider = new SliderUI({ knobRadius: KNOB_RADIUS, initial: 0.55 });
  }

  setTheme(theme: FigureTheme) {
    this.renderer.setTheme(theme === "light" ? 1 : 0);
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    this.slider.layout(w, h);
    const petalH = Math.max(1, h - this.slider.reservedBand);
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

  pointer(p: PointerInfo) {
    this.slider.pointer(p);
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
    const g = this.slider.geometry();
    gl.useProgram(this.rectProg);
    gl.uniform2f(this.rectResLoc, this.w, this.h);
    gl.bindVertexArray(this.rectVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawRect(g.x0, g.y - TRACK_H / 2, g.x1, g.y + TRACK_H / 2, TRACK_COLOR);
    this.drawRect(
      g.knobX - KNOB_RADIUS,
      g.y - KNOB_RADIUS,
      g.knobX + KNOB_RADIUS,
      g.y + KNOB_RADIUS,
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
    this.renderer.setBulge(this.slider.value);
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
  create(host, theme) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new LotusPetalMixSketch(host.gl, theme);
  },
};

export default mod;
