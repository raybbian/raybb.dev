import {
  bindInstancedFloatAttribs,
  createProgram,
  unitCircleMesh,
} from "@/lib/gl";
import { TREAT_INST_FLOATS } from "@/sim/Treats";
import VS from "@/shaders/treat.vert.glsl";
import FS from "@/shaders/treat.frag.glsl";

const CIRCLE_SEG = 32; // morsels are tiny — a coarse fan is plenty

// Instanced tan disks. Drawn into the scene MRT (before the water composite)
// so the depth attachment + water pass tint each treat bluer as it sinks,
// exactly like the fish bodies.
export class TreatRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private circleVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private circleCount: number;
  private resLoc: WebGLUniformLocation;
  private scrollLoc: WebGLUniformLocation;
  private capacityFloats = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS);
    this.resLoc = gl.getUniformLocation(this.prog, "u_res")!;
    this.scrollLoc = gl.getUniformLocation(this.prog, "u_scroll")!;

    const circle = unitCircleMesh(CIRCLE_SEG);
    this.circleCount = circle.length / 2;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.circleVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, circle, gl.STATIC_DRAW);
    const aUnit = gl.getAttribLocation(this.prog, "a_unit");
    gl.enableVertexAttribArray(aUnit);
    gl.vertexAttribPointer(aUnit, 2, gl.FLOAT, false, 0, 0);

    this.instVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    bindInstancedFloatAttribs(gl, this.prog, [
      ["i_center", 2],
      ["i_radius", 1],
      ["i_depth", 1],
      ["i_color", 3],
    ]);
    gl.bindVertexArray(null);
  }

  draw(
    data: Float32Array,
    count: number,
    width: number,
    height: number,
    scroll = 0,
  ) {
    if (count === 0) return;
    const gl = this.gl;
    const floats = count * TREAT_INST_FLOATS;
    gl.useProgram(this.prog);
    gl.uniform2f(this.resLoc, width, height);
    gl.uniform1f(this.scrollLoc, scroll);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    // Cap is fixed for the session: grow once to the full scratch, then
    // stream the live poses into it.
    if (floats > this.capacityFloats) {
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      this.capacityFloats = data.length;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floats);
    }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.prog);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.circleVbo);
    gl.deleteBuffer(this.instVbo);
  }
}
