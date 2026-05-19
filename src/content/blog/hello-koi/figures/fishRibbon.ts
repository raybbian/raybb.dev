import { createProgram } from "@/lib/gl";
import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { fishBodyMesh, fitInto } from "./fishMesh";
import { PALETTE as P } from "@/figures/palette";

// The body triangulation the renderer ACTUALLY uses (Fish.ts ~636-727):
// no ear-clipping. Every smoothed boundary point is joined to the spine
// centerline straight across from it (same u), making a ribbon of quads.
// Note the fan-like spokes to the centerline vs. the previous figure's
// ear-clipped sliver triangles. Tap to toggle the wireframe; the tail sways.

const VS = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 o;
void main() { o = u_color; }`;

class RibbonSketch implements Sketch {
  animated = true;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private uColor: WebGLUniformLocation;
  private w = 0;
  private h = 0;
  private wireOnly = false;
  private tris = new Float32Array(0);
  private lines = new Float32Array(0);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.uColor = gl.getUniformLocation(this.prog, "u_color")!;
    this.vao = gl.createVertexArray()!;
    this.vbo = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const loc = gl.getAttribLocation(this.prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") this.wireOnly = !this.wireOnly;
  }

  private build(t: number) {
    const { w, h } = this;
    if (w === 0 || h === 0) return;
    // Same body ring + swim curve as the ear-clip figure, but stitched the
    // way the renderer does: boundary↔centerline ribbon, fixed topology.
    const { verts, indices } = fishBodyMesh(
      (s) => Math.sin(t * 2.4 - s * 4) * 34 * s * s,
    );
    const pts = fitInto(verts, w, h, 0.1);
    const clip = pts.map((p) => ({
      x: (p.x / w) * 2 - 1,
      y: 1 - (p.y / h) * 2,
    }));

    const tris = new Float32Array(indices.length * 2);
    const lines = new Float32Array(indices.length * 4);
    for (let k = 0; k < indices.length; k += 3) {
      const a = clip[indices[k]];
      const b = clip[indices[k + 1]];
      const c = clip[indices[k + 2]];
      tris.set([a.x, a.y, b.x, b.y, c.x, c.y], k * 2);
      lines.set(
        [a.x, a.y, b.x, b.y, b.x, b.y, c.x, c.y, c.x, c.y, a.x, a.y],
        k * 4,
      );
    }
    this.tris = tris;
    this.lines = lines;
  }

  frame(t: number) {
    const gl = this.gl;
    this.build(t);
    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    if (!this.wireOnly && this.tris.length) {
      gl.bufferData(gl.ARRAY_BUFFER, this.tris, gl.DYNAMIC_DRAW);
      gl.uniform4fv(this.uColor, P.fillGL);
      gl.drawArrays(gl.TRIANGLES, 0, this.tris.length / 2);
    }
    if (this.lines.length) {
      gl.bufferData(gl.ARRAY_BUFFER, this.lines, gl.DYNAMIC_DRAW);
      gl.uniform4fv(this.uColor, P.wireGL);
      gl.drawArrays(gl.LINES, 0, this.lines.length / 2);
    }
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new RibbonSketch(host.gl);
  },
};

export default mod;
