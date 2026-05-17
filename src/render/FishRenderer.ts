import {
  bindInstancedFloatAttribs,
  createProgram,
  unitCircleMesh,
} from "@/lib/gl";
import {
  SHADOW_BIAS,
  SHADOW_DARKNESS,
  SHADOW_FADE,
  SHADOW_K,
  SHADOW_SUN_DIR,
  castShadowOffset,
  fishHeight,
  maxCastOffset,
} from "@/render/ShadowRenderer";
import type { FishGeometry } from "@/sim/Fish";
import type { KoiColors } from "@/sim/koiPattern";
import solidVert from "@/shaders/fish.vert.glsl";
import solidFrag from "@/shaders/fish.frag.glsl";
import ellipseVert from "@/shaders/ellipse.vert.glsl";
import ellipseFrag from "@/shaders/ellipse.frag.glsl";
import fullscreenVert from "@/shaders/water.vert.glsl";
import patternFrag from "@/shaders/pattern.frag.glsl";
import heightFrag from "@/shaders/height.frag.glsl";

// --- Buffer / pipeline sizing (single place to retune scratch + layout) ----
const MAX_VERTS = 8192;
const MAX_INDICES = 24576;
const CIRCLE_SEG = 48; // unit-circle tessellation for fin/eye instances
const VERT_FLOATS = 8; // x,y,r,g,b,a,u,v
const INST_FLOATS = 9; // cx,cy,rx,ry,rot,r,g,b,a
const MAX_FISH_INSTANCES = 32; // fins + eyes upper bound per draw
const MAX_PALETTES = 8; // one baked pattern texture per distinct fish
// Baked koi-pattern texture. Body is ~ASPECT(3)x longer than wide, so spend
// resolution along u. Static per session -> baked once per palette.
const PATTERN_W = 2048;
const PATTERN_H = 768;
const BYTES_PER_FLOAT = 4;
const VERT_STRIDE = VERT_FLOATS * BYTES_PER_FLOAT;
const ATTR_POS_OFFSET = 0 * BYTES_PER_FLOAT; // a_pos   (x,y)
const ATTR_COLOR_OFFSET = 2 * BYTES_PER_FLOAT; // a_color (r,g,b,a)
const ATTR_UV_OFFSET = 6 * BYTES_PER_FLOAT; // a_uv    (u,v)
// AA comes from the context's MSAA (silhouette) plus the fish fragment
// shader's fwidth edges (the pattern); FBM/WARP octaves now live as
// #defines in fish.frag.glsl.

interface ShadowLocs {
  tex: WebGLUniformLocation;
  fragRes: WebGLUniformLocation;
  sunDir: WebGLUniformLocation;
  k: WebGLUniformLocation;
  dark: WebGLUniformLocation;
  bias: WebGLUniformLocation;
  fade: WebGLUniformLocation;
  recv: WebGLUniformLocation;
}

function shadowLocs(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
): ShadowLocs {
  const u = (n: string) => gl.getUniformLocation(prog, n)!;
  return {
    tex: u("u_shadow"),
    fragRes: u("u_fragRes"),
    sunDir: u("u_sunDir"),
    k: u("u_shadowK"),
    dark: u("u_shadowDark"),
    bias: u("u_shadowBias"),
    fade: u("u_shadowFade"),
    recv: u("u_recvHeight"),
  };
}

export class FishRenderer {
  private gl: WebGL2RenderingContext;
  private solidProg: WebGLProgram;
  private ellipseProg: WebGLProgram;

  private solidVao: WebGLVertexArrayObject;
  private solidVbo: WebGLBuffer;
  private solidIbo: WebGLBuffer;

  private ellipseVao: WebGLVertexArrayObject;
  private circleVbo: WebGLBuffer;
  private instVbo: WebGLBuffer;
  private circleCount: number;

  // Caster pipeline: same vertex shaders, a height-output fragment shader,
  // their own VAOs (cast programs may assign different attribute locations).
  private solidCastProg: WebGLProgram;
  private ellipseCastProg: WebGLProgram;
  private solidCastVao: WebGLVertexArrayObject;
  private ellipseCastVao: WebGLVertexArrayObject;
  private solidCastRes: WebGLUniformLocation;
  private solidCastScroll: WebGLUniformLocation;
  private solidCastHeight: WebGLUniformLocation;
  private solidCastOffset: WebGLUniformLocation;
  private ellipseCastRes: WebGLUniformLocation;
  private ellipseCastScroll: WebGLUniformLocation;
  private ellipseCastHeight: WebGLUniformLocation;
  private ellipseCastOffset: WebGLUniformLocation;
  // Visible progs share the cast vertex shaders -> zero their offset each draw.
  private solidOffset: WebGLUniformLocation;
  private ellipseOffset: WebGLUniformLocation;

  private solidResLoc: WebGLUniformLocation;
  private ellipseResLoc: WebGLUniformLocation;
  private solidScrollLoc: WebGLUniformLocation;
  private ellipseScrollLoc: WebGLUniformLocation;
  private patternLoc: WebGLUniformLocation;
  private solidDepthLoc: WebGLUniformLocation;
  private ellipseDepthLoc: WebGLUniformLocation;
  private depth = 0; // submergence for the current draw(), set per frame
  private scroll = 0; // parallax offset (logical px) for the current draw()

  // Cast-shadow sampling (mask owned by ShadowRenderer, bound on unit 1).
  private solidShadow: ShadowLocs;
  private ellipseShadow: ShadowLocs;
  private shadowTex: WebGLTexture | null = null;
  private fragW = 0; // drawing-buffer px (canvas.width/height)
  private fragH = 0;

  // Pattern-bake pipeline (fullscreen triangle -> patternTex, once).
  private patternProg: WebGLProgram;
  private patternFbo: WebGLFramebuffer;
  private patternTexes: WebGLTexture[] = [];
  private bakeVao: WebGLVertexArrayObject;
  private pBaseLoc: WebGLUniformLocation;
  private pMidLoc: WebGLUniformLocation;
  private pAccentLoc: WebGLUniformLocation;
  private pSeedLoc: WebGLUniformLocation;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.solidProg = createProgram(gl, solidVert, solidFrag);
    this.ellipseProg = createProgram(gl, ellipseVert, ellipseFrag);
    this.solidResLoc = gl.getUniformLocation(this.solidProg, "u_res")!;
    this.ellipseResLoc = gl.getUniformLocation(this.ellipseProg, "u_res")!;
    this.solidScrollLoc = gl.getUniformLocation(this.solidProg, "u_scroll")!;
    this.ellipseScrollLoc =
      gl.getUniformLocation(this.ellipseProg, "u_scroll")!;
    this.patternLoc = gl.getUniformLocation(this.solidProg, "u_pattern")!;
    this.solidDepthLoc = gl.getUniformLocation(this.solidProg, "u_depth")!;
    this.ellipseDepthLoc = gl.getUniformLocation(this.ellipseProg, "u_depth")!;
    this.solidShadow = shadowLocs(gl, this.solidProg);
    this.ellipseShadow = shadowLocs(gl, this.ellipseProg);

    this.solidCastProg = createProgram(gl, solidVert, heightFrag);
    this.ellipseCastProg = createProgram(gl, ellipseVert, heightFrag);
    this.solidCastRes = gl.getUniformLocation(this.solidCastProg, "u_res")!;
    this.solidCastScroll =
      gl.getUniformLocation(this.solidCastProg, "u_scroll")!;
    this.solidCastHeight =
      gl.getUniformLocation(this.solidCastProg, "u_castHeight")!;
    this.solidCastOffset =
      gl.getUniformLocation(this.solidCastProg, "u_castOffset")!;
    this.ellipseCastRes =
      gl.getUniformLocation(this.ellipseCastProg, "u_res")!;
    this.ellipseCastScroll =
      gl.getUniformLocation(this.ellipseCastProg, "u_scroll")!;
    this.ellipseCastHeight =
      gl.getUniformLocation(this.ellipseCastProg, "u_castHeight")!;
    this.ellipseCastOffset =
      gl.getUniformLocation(this.ellipseCastProg, "u_castOffset")!;
    this.solidOffset = gl.getUniformLocation(this.solidProg, "u_castOffset")!;
    this.ellipseOffset =
      gl.getUniformLocation(this.ellipseProg, "u_castOffset")!;

    this.patternProg = createProgram(gl, fullscreenVert, patternFrag);
    this.pBaseLoc = gl.getUniformLocation(this.patternProg, "u_base")!;
    this.pMidLoc = gl.getUniformLocation(this.patternProg, "u_mid")!;
    this.pAccentLoc = gl.getUniformLocation(this.patternProg, "u_accent")!;
    this.pSeedLoc = gl.getUniformLocation(this.patternProg, "u_seed")!;
    this.bakeVao = gl.createVertexArray()!; // empty: gl_VertexID triangle
    this.patternFbo = gl.createFramebuffer()!;
    // Pattern textures are created + baked per palette in setPalettes().

    // Shared GPU buffers (the colour + caster VAOs both reference these).
    this.solidVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      MAX_VERTS * VERT_FLOATS * BYTES_PER_FLOAT,
      gl.DYNAMIC_DRAW,
    );
    this.solidIbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.solidIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MAX_INDICES * 4, gl.DYNAMIC_DRAW);

    const circle = unitCircleMesh(CIRCLE_SEG);
    this.circleCount = circle.length / 2;
    this.circleVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, circle, gl.STATIC_DRAW);
    this.instVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      MAX_FISH_INSTANCES * INST_FLOATS * BYTES_PER_FLOAT,
      gl.DYNAMIC_DRAW,
    );

    this.solidVao = this.buildSolidVao(this.solidProg);
    this.solidCastVao = this.buildSolidVao(this.solidCastProg);
    this.ellipseVao = this.buildEllipseVao(this.ellipseProg);
    this.ellipseCastVao = this.buildEllipseVao(this.ellipseCastProg);
  }

  // VAO binding the shared body buffers for `prog`'s own attribute locations
  // (the colour and caster programs may assign them differently).
  private buildSolidVao(prog: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, VERT_STRIDE, ATTR_POS_OFFSET);
    const aColor = gl.getAttribLocation(prog, "a_color");
    if (aColor >= 0) {
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(
        aColor, 4, gl.FLOAT, false, VERT_STRIDE, ATTR_COLOR_OFFSET,
      );
    }
    const aUv = gl.getAttribLocation(prog, "a_uv");
    if (aUv >= 0) {
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, VERT_STRIDE, ATTR_UV_OFFSET);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.solidIbo);
    gl.bindVertexArray(null);
    return vao;
  }

  private buildEllipseVao(prog: WebGLProgram): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.circleVbo);
    const aUnit = gl.getAttribLocation(prog, "a_unit");
    gl.enableVertexAttribArray(aUnit);
    gl.vertexAttribPointer(aUnit, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    bindInstancedFloatAttribs(gl, prog, [
      ["i_center", 2],
      ["i_half", 2],
      ["i_rot", 1],
      ["i_color", 4],
    ]);
    gl.bindVertexArray(null);
    return vao;
  }

  // Caster pass: the fish's real silhouette (body mesh + fins) into the bound
  // height mask. MAX-blend / no-depth state is set by ShadowRenderer.begin().
  cast(
    geo: FishGeometry,
    width: number,
    height: number,
    castHeight: number,
    scroll: number,
  ) {
    const gl = this.gl;
    const off = castShadowOffset(castHeight);
    const mo = maxCastOffset();
    if (geo.iCount > 0) {
      gl.useProgram(this.solidCastProg);
      gl.uniform2f(this.solidCastRes, width + mo[0], height + mo[1]);
      gl.uniform1f(this.solidCastScroll, scroll);
      gl.uniform1f(this.solidCastHeight, castHeight);
      gl.uniform2f(this.solidCastOffset, off[0], off[1]);
      gl.bindVertexArray(this.solidCastVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, geo.vCount);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.solidIbo);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, geo.indices, 0, geo.iCount);
      gl.drawElements(gl.TRIANGLES, geo.iCount, gl.UNSIGNED_INT, 0);
    }
    if (geo.finCount > 0) {
      gl.useProgram(this.ellipseCastProg);
      gl.uniform2f(this.ellipseCastRes, width + mo[0], height + mo[1]);
      gl.uniform1f(this.ellipseCastScroll, scroll);
      gl.uniform1f(this.ellipseCastHeight, castHeight);
      gl.uniform2f(this.ellipseCastOffset, off[0], off[1]);
      gl.bindVertexArray(this.ellipseCastVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.finInstances, 0, geo.finCount);
      gl.drawArraysInstanced(
        gl.TRIANGLES, 0, this.circleCount, geo.finCount / INST_FLOATS,
      );
    }
    gl.bindVertexArray(null);
  }

  // Each palette is fixed per session, so its procedural koi pattern is baked
  // once here into its own texture; draw() binds the one for the fish being
  // drawn and fish.frag just samples it. Capped at MAX_PALETTES.
  setPalettes(palettes: KoiColors[]) {
    const gl = this.gl;
    const rgb3 = (c: number[]): [number, number, number] => [c[0], c[1], c[2]];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.patternFbo);
    gl.viewport(0, 0, PATTERN_W, PATTERN_H);
    gl.disable(gl.BLEND);
    gl.useProgram(this.patternProg);
    gl.bindVertexArray(this.bakeVao);

    const n = Math.min(palettes.length, MAX_PALETTES);
    for (let i = 0; i < n; i++) {
      const p = palettes[i];
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, PATTERN_W, PATTERN_H, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0,
      );
      gl.uniform3fv(this.pBaseLoc, rgb3(p.base));
      gl.uniform3fv(this.pMidLoc, rgb3(p.mid));
      gl.uniform3fv(this.pAccentLoc, rgb3(p.accent));
      gl.uniform2fv(this.pSeedLoc, p.seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.patternTexes.push(tex);
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Latches the per-frame cast-shadow mask + drawing-buffer size. Called once
  // before the fish loop; the actual uniforms are pushed per program in draw().
  prepareShadow(tex: WebGLTexture, fragW: number, fragH: number) {
    this.shadowTex = tex;
    this.fragW = fragW;
    this.fragH = fragH;
  }

  // Pushes the shadow uniforms and binds the mask on texture unit 1, leaving
  // unit 0 active (the solid pass keeps its pattern bound there).
  private applyShadow(l: ShadowLocs) {
    const gl = this.gl;
    gl.uniform2f(l.fragRes, this.fragW, this.fragH);
    gl.uniform2f(l.sunDir, SHADOW_SUN_DIR[0], SHADOW_SUN_DIR[1]);
    gl.uniform1f(l.k, SHADOW_K);
    gl.uniform1f(l.dark, SHADOW_DARKNESS);
    gl.uniform1f(l.bias, SHADOW_BIAS);
    gl.uniform1f(l.fade, SHADOW_FADE);
    gl.uniform1f(l.recv, fishHeight(this.depth));
    if (this.shadowTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.uniform1i(l.tex, 1);
      gl.activeTexture(gl.TEXTURE0);
    }
  }

  private drawInstances(
    data: Float32Array,
    floatCount: number,
    res: [number, number],
  ) {
    if (floatCount === 0) return;
    const count = floatCount / INST_FLOATS;
    const gl = this.gl;
    gl.useProgram(this.ellipseProg);
    gl.uniform2f(this.ellipseResLoc, res[0], res[1]);
    gl.uniform1f(this.ellipseScrollLoc, this.scroll);
    gl.uniform1f(this.ellipseDepthLoc, this.depth);
    gl.uniform2f(this.ellipseOffset, 0, 0); // visible fins at real position
    this.applyShadow(this.ellipseShadow);
    gl.bindVertexArray(this.ellipseVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floatCount);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
  }

  // Draws fins/body/eyes into the already-prepared scene FBO. `depth` is the
  // fish's submergence (0..1); it is written to the depth attachment so the
  // water pass can tint/refract by it.
  draw(
    geo: FishGeometry,
    width: number,
    height: number,
    depth: number,
    paletteIndex = 0,
    scroll = 0,
  ) {
    const gl = this.gl;
    const res: [number, number] = [width, height];
    this.depth = depth;
    this.scroll = scroll;

    // Pectoral + ventral fins (under body)
    this.drawInstances(geo.finInstances, geo.finCount, res);

    // Caudal + body + dorsal (single solid draw, painter order via index order)
    const vCount = geo.vCount;
    const iCount = geo.iCount;
    if (iCount > 0) {
      gl.useProgram(this.solidProg);
      gl.uniform2f(this.solidResLoc, width, height);
      gl.uniform1f(this.solidScrollLoc, scroll);
      gl.uniform1f(this.solidDepthLoc, depth);
      gl.uniform2f(this.solidOffset, 0, 0); // visible body at real position
      gl.activeTexture(gl.TEXTURE0);
      const tex =
        this.patternTexes[Math.min(paletteIndex, this.patternTexes.length - 1)];
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.patternLoc, 0);
      this.applyShadow(this.solidShadow);
      gl.bindVertexArray(this.solidVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, vCount);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.solidIbo);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, geo.indices, 0, iCount);
      gl.drawElements(gl.TRIANGLES, iCount, gl.UNSIGNED_INT, 0);
    }

    // Eyes (on top)
    this.drawInstances(geo.eyeInstances, geo.eyeCount, res);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.solidProg);
    gl.deleteProgram(this.ellipseProg);
    gl.deleteProgram(this.solidCastProg);
    gl.deleteProgram(this.ellipseCastProg);
    gl.deleteProgram(this.patternProg);
    gl.deleteVertexArray(this.solidVao);
    gl.deleteVertexArray(this.ellipseVao);
    gl.deleteVertexArray(this.solidCastVao);
    gl.deleteVertexArray(this.ellipseCastVao);
    gl.deleteVertexArray(this.bakeVao);
    gl.deleteBuffer(this.solidVbo);
    gl.deleteBuffer(this.solidIbo);
    gl.deleteBuffer(this.circleVbo);
    gl.deleteBuffer(this.instVbo);
    gl.deleteFramebuffer(this.patternFbo);
    for (const tex of this.patternTexes) gl.deleteTexture(tex);
  }
}
