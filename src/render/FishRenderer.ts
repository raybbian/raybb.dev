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
  WATER_H,
  castShadowOffset,
  fishHeight,
  shadowMargin,
  shadowSunDir,
} from "@/render/ShadowRenderer";
import type { FishGeometry } from "@/sim/Fish";
import type { KoiColors, Rgba } from "@/sim/koiPattern";
import solidVert from "@/render/shaders/fish.vert.glsl";
import solidFrag from "@/render/shaders/fish.frag.glsl";
import ellipseVert from "@/render/shaders/ellipse.vert.glsl";
import ellipseFrag from "@/render/shaders/ellipse.frag.glsl";
import fullscreenVert from "@/render/shaders/water.vert.glsl";
import patternFrag from "@/render/shaders/pattern.frag.glsl";
import heightFrag from "@/render/shaders/height.frag.glsl";
import { PatternBakeProgram } from "@/render/patternBaker";
import { bindNoiseUniform } from "@/render/noiseTexture";

const MAX_VERTS = 8192;
const MAX_INDICES = 24576;
const CIRCLE_SEG = 48;
const VERT_FLOATS = 8; // x,y,r,g,b,a,u,v
const INST_FLOATS = 9; // cx,cy,rx,ry,rot,r,g,b,a
const MAX_FISH_INSTANCES = 32;
const MAX_PALETTES = 12;
// Body is ~ASPECT(3)x longer than wide, so spend resolution along u.
const PATTERN_W = 2048;
const PATTERN_H = 768;
const BYTES_PER_FLOAT = 4;
const VERT_STRIDE = VERT_FLOATS * BYTES_PER_FLOAT;
const ATTR_POS_OFFSET = 0 * BYTES_PER_FLOAT;
const ATTR_COLOR_OFFSET = 2 * BYTES_PER_FLOAT;
const ATTR_UV_OFFSET = 6 * BYTES_PER_FLOAT;

export type FishPart =
  | "caudal"
  | "body"
  | "dorsalShadow"
  | "dorsal"
  | "fins"
  | "eyes";

export interface FishRendererConfig {
  // Per-part enable flags. Default: all true. Disabling a part skips its draw
  // call entirely (and its caster pass, when caster is enabled).
  enable?: Partial<Record<FishPart, boolean>>;
  // Shader overrides. Default: production shaders (pattern + shadow). Pass
  // flat fragment shaders to opt out of pattern sampling + shadow receiver
  // for blog-figure use cases.
  shaders?: {
    solidVert?: string;
    solidFrag?: string;
    ellipseVert?: string;
    ellipseFrag?: string;
  };
  // Feature toggles. Default: all true.
  // - pattern: bind u_pattern and bake palettes; without it, setPalettes is a
  //   no-op and body vertices fall back to their vertex color
  // - shadow:  bind cast-shadow mask + receiver uniforms
  // - cast:    build cast programs and run the cast() pass; without it,
  //   cast() is a no-op
  features?: {
    pattern?: boolean;
    shadow?: boolean;
    cast?: boolean;
  };
}

interface ShadowLocs {
  tex: WebGLUniformLocation | null;
  fragRes: WebGLUniformLocation | null;
  sunDir: WebGLUniformLocation | null;
  k: WebGLUniformLocation | null;
  dark: WebGLUniformLocation | null;
  bias: WebGLUniformLocation | null;
  fade: WebGLUniformLocation | null;
  recv: WebGLUniformLocation | null;
  surfaceH: WebGLUniformLocation | null;
  margin: WebGLUniformLocation | null;
  dbg: WebGLUniformLocation | null;
}

function shadowLocs(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
): ShadowLocs {
  const u = (n: string) => gl.getUniformLocation(prog, n);
  return {
    tex: u("u_shadow"),
    fragRes: u("u_fragRes"),
    sunDir: u("u_sunDir"),
    k: u("u_shadowK"),
    dark: u("u_shadowDark"),
    bias: u("u_shadowBias"),
    fade: u("u_shadowFade"),
    recv: u("u_recvHeight"),
    surfaceH: u("u_surfaceH"),
    margin: u("u_shadowMargin"),
    dbg: u("u_shadowDebug"),
  };
}

const ALL_PARTS_ON: Record<FishPart, boolean> = {
  caudal: true,
  body: true,
  dorsalShadow: true,
  dorsal: true,
  fins: true,
  eyes: true,
};

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

  // Caster pipeline: only created when features.cast is on.
  private solidCastProg: WebGLProgram | null = null;
  private ellipseCastProg: WebGLProgram | null = null;
  private solidCastVao: WebGLVertexArrayObject | null = null;
  private ellipseCastVao: WebGLVertexArrayObject | null = null;
  private solidCastRes: WebGLUniformLocation | null = null;
  private solidCastScroll: WebGLUniformLocation | null = null;
  private solidCastHeight: WebGLUniformLocation | null = null;
  private solidCastOffset: WebGLUniformLocation | null = null;
  private ellipseCastRes: WebGLUniformLocation | null = null;
  private ellipseCastScroll: WebGLUniformLocation | null = null;
  private ellipseCastHeight: WebGLUniformLocation | null = null;
  private ellipseCastOffset: WebGLUniformLocation | null = null;
  // Visible progs share the cast vertex shaders -> zero their offset each draw.
  private solidOffset: WebGLUniformLocation | null;
  private ellipseOffset: WebGLUniformLocation | null;

  private solidResLoc: WebGLUniformLocation | null;
  private ellipseResLoc: WebGLUniformLocation | null;
  private solidScrollLoc: WebGLUniformLocation | null;
  private ellipseScrollLoc: WebGLUniformLocation | null;
  private patternLoc: WebGLUniformLocation | null;
  private solidDepthLoc: WebGLUniformLocation | null;
  private ellipseDepthLoc: WebGLUniformLocation | null;
  private solidTimeLoc: WebGLUniformLocation | null;
  private ellipseTimeLoc: WebGLUniformLocation | null;
  private depth = 0; // submergence for the current draw()
  private themeMix = 1; // 0 = dark, 1 = light; eased by the caller
  private scroll = 0; // parallax offset (logical px) for the current draw()
  private time = 0; // seconds, drives the wavy-shadow displacement

  // Cast-shadow mask owned by ShadowRenderer, bound on unit 1.
  private solidShadow: ShadowLocs | null = null;
  private ellipseShadow: ShadowLocs | null = null;
  private shadowTex: WebGLTexture | null = null;
  private fragW = 0; // drawing-buffer px
  private fragH = 0;

  // Pattern bake pipeline: only created when features.pattern is on.
  private patternBaker: PatternBakeProgram | null = null;
  private patternFbo: WebGLFramebuffer | null = null;
  private patternTexes: WebGLTexture[] = [];

  // Lazy wireframe buffer for drawBodyWireframe. Position-only attribute,
  // a_color and a_uv are set via vertexAttrib4f for a constant edge color.
  private lineVbo: WebGLBuffer | null = null;
  private lineVao: WebGLVertexArrayObject | null = null;

  private enable: Record<FishPart, boolean>;
  private features: Required<NonNullable<FishRendererConfig["features"]>>;

  constructor(gl: WebGL2RenderingContext, config: FishRendererConfig = {}) {
    this.gl = gl;
    this.enable = { ...ALL_PARTS_ON, ...(config.enable ?? {}) };
    this.features = {
      pattern: config.features?.pattern ?? true,
      shadow: config.features?.shadow ?? true,
      cast: config.features?.cast ?? true,
    };

    const sV = config.shaders?.solidVert ?? solidVert;
    const sF = config.shaders?.solidFrag ?? solidFrag;
    const eV = config.shaders?.ellipseVert ?? ellipseVert;
    const eF = config.shaders?.ellipseFrag ?? ellipseFrag;

    this.solidProg = createProgram(gl, sV, sF);
    this.ellipseProg = createProgram(gl, eV, eF);
    this.solidResLoc = gl.getUniformLocation(this.solidProg, "u_res");
    this.ellipseResLoc = gl.getUniformLocation(this.ellipseProg, "u_res");
    this.solidScrollLoc = gl.getUniformLocation(this.solidProg, "u_scroll");
    this.ellipseScrollLoc =
      gl.getUniformLocation(this.ellipseProg, "u_scroll");
    this.patternLoc = gl.getUniformLocation(this.solidProg, "u_pattern");
    this.solidDepthLoc = gl.getUniformLocation(this.solidProg, "u_depth");
    this.ellipseDepthLoc = gl.getUniformLocation(this.ellipseProg, "u_depth");
    this.solidTimeLoc = gl.getUniformLocation(this.solidProg, "u_time");
    this.ellipseTimeLoc = gl.getUniformLocation(this.ellipseProg, "u_time");
    this.solidOffset = gl.getUniformLocation(this.solidProg, "u_castOffset");
    this.ellipseOffset =
      gl.getUniformLocation(this.ellipseProg, "u_castOffset");
    if (this.features.shadow) {
      this.solidShadow = shadowLocs(gl, this.solidProg);
      this.ellipseShadow = shadowLocs(gl, this.ellipseProg);
      // u_noise (shared tileable noise) is bound on a reserved unit; the
      // shadow.glsl include's wavy-displacement path samples it instead of
      // running per-pixel FBM.
      bindNoiseUniform(gl, this.solidProg);
      bindNoiseUniform(gl, this.ellipseProg);
    }

    if (this.features.cast) {
      this.solidCastProg = createProgram(gl, sV, heightFrag);
      this.ellipseCastProg = createProgram(gl, eV, heightFrag);
      this.solidCastRes = gl.getUniformLocation(this.solidCastProg, "u_res");
      this.solidCastScroll =
        gl.getUniformLocation(this.solidCastProg, "u_scroll");
      this.solidCastHeight =
        gl.getUniformLocation(this.solidCastProg, "u_castHeight");
      this.solidCastOffset =
        gl.getUniformLocation(this.solidCastProg, "u_castOffset");
      this.ellipseCastRes =
        gl.getUniformLocation(this.ellipseCastProg, "u_res");
      this.ellipseCastScroll =
        gl.getUniformLocation(this.ellipseCastProg, "u_scroll");
      this.ellipseCastHeight =
        gl.getUniformLocation(this.ellipseCastProg, "u_castHeight");
      this.ellipseCastOffset =
        gl.getUniformLocation(this.ellipseCastProg, "u_castOffset");
    }

    if (this.features.pattern) {
      this.patternBaker = new PatternBakeProgram(gl, fullscreenVert, patternFrag);
      this.patternFbo = gl.createFramebuffer()!;
    }

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
    if (this.solidCastProg) {
      this.solidCastVao = this.buildSolidVao(this.solidCastProg);
    }
    this.ellipseVao = this.buildEllipseVao(this.ellipseProg);
    if (this.ellipseCastProg) {
      this.ellipseCastVao = this.buildEllipseVao(this.ellipseCastProg);
    }
  }

  // Binds the shared body buffers for `prog`'s own attribute locations (colour
  // and caster programs may assign them differently).
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

  // Caster pass: real silhouette (body mesh + fins) into the bound height
  // mask. No-blend / no-depth state is set by ShadowRenderer.begin().
  cast(
    geo: FishGeometry,
    width: number,
    height: number,
    castHeight: number,
    scroll: number,
  ) {
    if (!this.features.cast) return;
    if (!this.solidCastProg || !this.ellipseCastProg) return;
    const gl = this.gl;
    const o = castShadowOffset(castHeight, this.themeMix);
    const [mx, my] = shadowMargin();
    // +mx folds in the X origin shift (mask grown both sides for the mirrored sun).
    const off: [number, number] = [o[0] + mx, o[1]];
    const bodyEnabled = this.enable.body || this.enable.caudal || this.enable.dorsal;
    if (geo.iCount > 0 && bodyEnabled) {
      gl.useProgram(this.solidCastProg);
      if (this.solidCastRes) gl.uniform2f(this.solidCastRes, width + 2 * mx, height + my);
      if (this.solidCastScroll) gl.uniform1f(this.solidCastScroll, scroll);
      if (this.solidCastHeight) gl.uniform1f(this.solidCastHeight, castHeight);
      if (this.solidCastOffset) gl.uniform2f(this.solidCastOffset, off[0], off[1]);
      gl.bindVertexArray(this.solidCastVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, geo.vCount);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.solidIbo);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, geo.indices, 0, geo.iCount);
      // The dorsal self-shadow band is a fake (visual-only) caster: skip its
      // index range so it never enters the height mask. Caudal+body, then the
      // dorsal fin, both at the unchanged castHeight/offset.
      if (this.enable.caudal && this.enable.body) {
        gl.drawElements(gl.TRIANGLES, geo.shadowIdxStart, gl.UNSIGNED_INT, 0);
      } else if (this.enable.caudal) {
        gl.drawElements(
          gl.TRIANGLES, geo.bodyIdxStart, gl.UNSIGNED_INT, 0,
        );
      } else if (this.enable.body) {
        gl.drawElements(
          gl.TRIANGLES,
          geo.shadowIdxStart - geo.bodyIdxStart,
          gl.UNSIGNED_INT,
          geo.bodyIdxStart * 4,
        );
      }
      if (this.enable.dorsal) {
        gl.drawElements(
          gl.TRIANGLES,
          geo.iCount - geo.dorsalIdxStart,
          gl.UNSIGNED_INT,
          geo.dorsalIdxStart * 4,
        );
      }
    }
    if (this.enable.fins && geo.finCount > 0) {
      gl.useProgram(this.ellipseCastProg);
      if (this.ellipseCastRes) gl.uniform2f(this.ellipseCastRes, width + 2 * mx, height + my);
      if (this.ellipseCastScroll) gl.uniform1f(this.ellipseCastScroll, scroll);
      if (this.ellipseCastHeight) gl.uniform1f(this.ellipseCastHeight, castHeight);
      if (this.ellipseCastOffset) gl.uniform2f(this.ellipseCastOffset, off[0], off[1]);
      gl.bindVertexArray(this.ellipseCastVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.finInstances, 0, geo.finCount);
      gl.drawArraysInstanced(
        gl.TRIANGLES, 0, this.circleCount, geo.finCount / INST_FLOATS,
      );
    }
    gl.bindVertexArray(null);
  }

  // Palettes are fixed per session: bake each procedural koi pattern once into
  // its own texture (capped at MAX_PALETTES); draw() just samples it. No-op
  // when the renderer was configured with `features.pattern: false`.
  setPalettes(palettes: KoiColors[]) {
    if (!this.features.pattern || !this.patternBaker || !this.patternFbo) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.patternFbo);
    gl.viewport(0, 0, PATTERN_W, PATTERN_H);
    gl.disable(gl.BLEND);
    this.patternBaker.use();

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
      this.patternBaker.setPalette(p);
      this.patternBaker.bake();
      gl.generateMipmap(gl.TEXTURE_2D);
      this.patternTexes.push(tex);
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Latches the per-frame mask + drawing-buffer size; uniforms are pushed per
  // program later in draw().
  // 0 = dark pond, 1 = light pond. Eased by the caller so the cast offset and
  // the receiver's sun lookup mirror in lockstep when the theme toggles.
  setTheme(mix: number): void {
    this.themeMix = mix;
  }

  prepareShadow(tex: WebGLTexture, fragW: number, fragH: number) {
    if (!this.features.shadow) return;
    this.shadowTex = tex;
    this.fragW = fragW;
    this.fragH = fragH;
  }

  // Binds the mask on unit 1, leaving unit 0 active (the solid pass keeps its
  // pattern bound there).
  private applyShadow(l: ShadowLocs | null) {
    if (!l) return;
    const gl = this.gl;
    if (l.fragRes) gl.uniform2f(l.fragRes, this.fragW, this.fragH);
    const sd = shadowSunDir(this.themeMix);
    if (l.sunDir) gl.uniform2f(l.sunDir, sd[0], sd[1]);
    const [mx, my] = shadowMargin();
    if (l.margin) gl.uniform2f(l.margin, mx, my);
    if (l.k) gl.uniform1f(l.k, SHADOW_K);
    if (l.dark) gl.uniform1f(l.dark, SHADOW_DARKNESS);
    if (l.bias) gl.uniform1f(l.bias, SHADOW_BIAS);
    if (l.fade) gl.uniform1f(l.fade, SHADOW_FADE);
    if (l.recv) gl.uniform1f(l.recv, fishHeight(this.depth));
    if (l.surfaceH) gl.uniform1f(l.surfaceH, WATER_H);
    if (l.dbg) {
      gl.uniform1f(
        l.dbg,
        typeof window !== "undefined" &&
          (window as unknown as { __shadowDebug?: boolean }).__shadowDebug
          ? 1
          : 0,
      );
    }
    if (this.shadowTex && l.tex) {
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
    if (this.ellipseResLoc) gl.uniform2f(this.ellipseResLoc, res[0], res[1]);
    if (this.ellipseScrollLoc) gl.uniform1f(this.ellipseScrollLoc, this.scroll);
    if (this.ellipseDepthLoc) gl.uniform1f(this.ellipseDepthLoc, this.depth);
    if (this.ellipseTimeLoc) gl.uniform1f(this.ellipseTimeLoc, this.time);
    if (this.ellipseOffset) gl.uniform2f(this.ellipseOffset, 0, 0);
    this.applyShadow(this.ellipseShadow);
    gl.bindVertexArray(this.ellipseVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floatCount);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, this.circleCount, count);
  }

  // `depth` is submergence (0..1), written to the depth attachment so the
  // water pass can tint/refract by it.
  draw(
    geo: FishGeometry,
    width: number,
    height: number,
    depth: number,
    paletteIndex = 0,
    scroll = 0,
    time = 0,
  ) {
    const gl = this.gl;
    const res: [number, number] = [width, height];
    this.depth = depth;
    this.scroll = scroll;
    this.time = time;

    // Painter order: fins under body, eyes on top.
    if (this.enable.fins) {
      this.drawInstances(geo.finInstances, geo.finCount, res);
    }

    const vCount = geo.vCount;
    const iCount = geo.iCount;
    const solidNeeded =
      iCount > 0 &&
      (this.enable.caudal ||
        this.enable.body ||
        this.enable.dorsalShadow ||
        this.enable.dorsal);
    if (solidNeeded) {
      gl.useProgram(this.solidProg);
      if (this.solidResLoc) gl.uniform2f(this.solidResLoc, width, height);
      if (this.solidScrollLoc) gl.uniform1f(this.solidScrollLoc, scroll);
      if (this.solidDepthLoc) gl.uniform1f(this.solidDepthLoc, depth);
      if (this.solidTimeLoc) gl.uniform1f(this.solidTimeLoc, time);
      if (this.solidOffset) gl.uniform2f(this.solidOffset, 0, 0);
      if (this.features.pattern && this.patternLoc && this.patternTexes.length > 0) {
        gl.activeTexture(gl.TEXTURE0);
        const tex =
          this.patternTexes[Math.min(paletteIndex, this.patternTexes.length - 1)];
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(this.patternLoc, 0);
      }
      this.applyShadow(this.solidShadow);
      gl.bindVertexArray(this.solidVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.solidVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo.verts, 0, vCount);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.solidIbo);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, geo.indices, 0, iCount);
      // Caudal + body (opaque), then the dorsal self-shadow band (alpha-blended
      // black = multiply-darken the body), then the opaque dorsal on top so the
      // band only shows fanning out from the fin's down-sun side.
      if (this.enable.caudal && this.enable.body) {
        gl.drawElements(gl.TRIANGLES, geo.shadowIdxStart, gl.UNSIGNED_INT, 0);
      } else if (this.enable.caudal) {
        gl.drawElements(
          gl.TRIANGLES, geo.bodyIdxStart, gl.UNSIGNED_INT, 0,
        );
      } else if (this.enable.body) {
        gl.drawElements(
          gl.TRIANGLES,
          geo.shadowIdxStart - geo.bodyIdxStart,
          gl.UNSIGNED_INT,
          geo.bodyIdxStart * 4,
        );
      }
      if (this.enable.dorsalShadow) {
        const hadBlend = gl.isEnabled(gl.BLEND);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawElements(
          gl.TRIANGLES,
          geo.dorsalIdxStart - geo.shadowIdxStart,
          gl.UNSIGNED_INT,
          geo.shadowIdxStart * 4,
        );
        if (!hadBlend) gl.disable(gl.BLEND);
      }
      if (this.enable.dorsal) {
        gl.drawElements(
          gl.TRIANGLES,
          iCount - geo.dorsalIdxStart,
          gl.UNSIGNED_INT,
          geo.dorsalIdxStart * 4,
        );
      }
    }

    if (this.enable.eyes) {
      this.drawInstances(geo.eyeInstances, geo.eyeCount, res);
    }
    gl.bindVertexArray(null);
  }

  // Draw the body indices of `geo` as line segments (3 edges per triangle).
  // The wireframe VAO only binds a_pos; a_color/a_uv are pinned via
  // vertexAttrib*f so any solid program (flat or production) renders the
  // edges as a flat color. Reads (x, y) from the same interleaved buffer
  // draw() uploads — same source of truth, no separate mesh argument.
  drawBodyWireframe(
    geo: FishGeometry,
    width: number,
    height: number,
    color: Rgba,
  ) {
    const gl = this.gl;
    const start = geo.bodyIdxStart;
    const end = geo.shadowIdxStart;
    const triIdxCount = end - start;
    if (triIdxCount <= 0) return;
    const lineFloats = new Float32Array((triIdxCount / 3) * 12);
    let lw = 0;
    const vbuf = geo.verts;
    const idx = geo.indices;
    for (let i = start; i < end; i += 3) {
      const a = idx[i] * VERT_FLOATS;
      const b = idx[i + 1] * VERT_FLOATS;
      const c = idx[i + 2] * VERT_FLOATS;
      const ax = vbuf[a], ay = vbuf[a + 1];
      const bx = vbuf[b], by = vbuf[b + 1];
      const cx = vbuf[c], cy = vbuf[c + 1];
      lineFloats[lw++] = ax; lineFloats[lw++] = ay;
      lineFloats[lw++] = bx; lineFloats[lw++] = by;
      lineFloats[lw++] = bx; lineFloats[lw++] = by;
      lineFloats[lw++] = cx; lineFloats[lw++] = cy;
      lineFloats[lw++] = cx; lineFloats[lw++] = cy;
      lineFloats[lw++] = ax; lineFloats[lw++] = ay;
    }

    this.ensureLineBuffers();
    gl.useProgram(this.solidProg);
    if (this.solidResLoc) gl.uniform2f(this.solidResLoc, width, height);
    if (this.solidScrollLoc) gl.uniform1f(this.solidScrollLoc, 0);
    if (this.solidDepthLoc) gl.uniform1f(this.solidDepthLoc, 0);
    if (this.solidTimeLoc) gl.uniform1f(this.solidTimeLoc, 0);
    if (this.solidOffset) gl.uniform2f(this.solidOffset, 0, 0);
    this.applyShadow(this.solidShadow);

    gl.bindVertexArray(this.lineVao);
    const aColor = gl.getAttribLocation(this.solidProg, "a_color");
    if (aColor >= 0) {
      gl.vertexAttrib4f(aColor, color[0], color[1], color[2], color[3]);
    }
    const aUv = gl.getAttribLocation(this.solidProg, "a_uv");
    if (aUv >= 0) gl.vertexAttrib4f(aUv, 0, 0, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineFloats, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, lineFloats.length / 2);
    gl.bindVertexArray(null);
  }

  private ensureLineBuffers() {
    if (this.lineVbo && this.lineVao) return;
    const gl = this.gl;
    this.lineVbo = gl.createBuffer()!;
    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
    const aPos = gl.getAttribLocation(this.solidProg, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteProgram(this.solidProg);
    gl.deleteProgram(this.ellipseProg);
    if (this.solidCastProg) gl.deleteProgram(this.solidCastProg);
    if (this.ellipseCastProg) gl.deleteProgram(this.ellipseCastProg);
    if (this.patternBaker) this.patternBaker.dispose();
    gl.deleteVertexArray(this.solidVao);
    gl.deleteVertexArray(this.ellipseVao);
    if (this.solidCastVao) gl.deleteVertexArray(this.solidCastVao);
    if (this.ellipseCastVao) gl.deleteVertexArray(this.ellipseCastVao);
    if (this.lineVao) gl.deleteVertexArray(this.lineVao);
    gl.deleteBuffer(this.solidVbo);
    gl.deleteBuffer(this.solidIbo);
    gl.deleteBuffer(this.circleVbo);
    gl.deleteBuffer(this.instVbo);
    if (this.lineVbo) gl.deleteBuffer(this.lineVbo);
    if (this.patternFbo) gl.deleteFramebuffer(this.patternFbo);
    for (const tex of this.patternTexes) gl.deleteTexture(tex);
  }
}
