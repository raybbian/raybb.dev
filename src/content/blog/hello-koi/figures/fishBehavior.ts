import type { FigureModule, FigureView, PointerInfo, Sketch } from "@/figures/types";
import { Fish } from "@/sim/Fish";
import { FishRenderer } from "@/render/FishRenderer";
import { TreatRenderer } from "@/render/TreatRenderer";
import { TREAT_INST_FLOATS } from "@/sim/Treats";
import { PALETTE as P } from "@/figures/palette";
import { createProgram } from "@/lib/gl";
import { FIGURE_FISH_SCALE, FIGURE_FISH_MAX } from "@/figures/units";
import { createFigureFish } from "@/figures/figureFish";
import fishFlatFrag from "@/render/shaders/fishFlat.frag.glsl";
import ellipseFlatFrag from "@/render/shaders/ellipseFlat.frag.glsl";
import ringVert from "./shaders/fishBehaviorRing.vert.glsl";
import ringFrag from "./shaders/fishBehaviorRing.frag.glsl";
import arrowVert from "./shaders/fishBehaviorArrow.vert.glsl";
import arrowFrag from "./shaders/fishBehaviorArrow.frag.glsl";
import type { Vec2 } from "@/lib/math";

// World == canvas: every fish stays visible. No camera follow.
const FISH_COUNT = 4;
const TREAT_CAP = 8;
// Base radii in world units, used as authored — the coordinate space scales them.
// so the treat morsel and eat trigger track the panel like everything else.
const TREAT_RADIUS_BASE = 7;
const EAT_RADIUS_BASE = 26; // matches Treats.EAT_EXTRA + small slack

// Figure canvases are much smaller than the production pond, so the
// CRUISE_SPEED default (12 px/tick) reads as fish darting across the strip
// in under two seconds. Mirror the production school's per-fish cruise band
// (3.5 px/tick + small jitter) and keep speed noise/bursts on top so the
// motion stays organic without overwhelming the panel.
const FIGURE_CRUISE_BASE = 3.5;
const FIGURE_CRUISE_JITTER = 1.0;

// Two-tone palette per fish so a school doesn't read as monochrome. All fins
// share one darker teal regardless of body so the silhouettes stay legible.
const FIN_COLOR: [number, number, number, number] = [0.13, 0.62, 0.56, 1.0];
const BODY_COLORS: [number, number, number, number][] = [
  [0.93, 0.41, 0.18, 1.0], // persimmon
  [0.98, 0.97, 0.94, 1.0], // porcelain
  [0.18, 0.83, 0.75, 1.0], // accent teal
  [0.55, 0.30, 0.65, 1.0], // ume
];

interface Treat {
  x: number;
  y: number;
  // No age/sink animation here — figures are illustrative; the production
  // sinking treats live in src/sim/Treats.ts.
}

const TREAT_COLOR: [number, number, number] = [0.8, 0.66, 0.42];

// ----- Debug overlay (component arrows + state pips + radii) ---------------
//
// One colour per behaviour component. The pip above each fish blends these by
// the magnitude each component contributes to the desired heading, and the
// arrows below visualize each component vector itself.
const COMP_COLORS = {
  wander:  [0.65, 0.71, 0.78, 0.95] as [number, number, number, number], // slate
  contain: [0.92, 0.65, 0.25, 0.95] as [number, number, number, number], // amber
  avoid:   [0.94, 0.36, 0.36, 0.95] as [number, number, number, number], // red
  seek:    [0.31, 0.78, 0.47, 0.95] as [number, number, number, number], // green
};
const SATED_COLOR: [number, number, number, number] = [0.47, 0.63, 0.86, 0.95];

// World-px length applied to each component vector before drawing. The
// component weights live in roughly [0, 7]; this multiplier puts the arrows
// at a readable length without overwhelming the panel.
const ARROW_SCALE = 18;
const ARROW_WIDTH = 1.6; // shaft half-width in px

const TREAT_RING_COLOR: [number, number, number, number] = [0.96, 0.78, 0.32, 0.85];
const CURSOR_RING_COLOR: [number, number, number, number] = [0.94, 0.36, 0.36, 0.6];

// Pip sizing in panel px.
const PIP_OUTER_R = 7;
const PIP_INNER_R = 4;
// Pip floats above the fish head — offset chosen to clear the dorsal fin.
const PIP_OFFSET_Y = 22;
// Treat eat-radius ring sits exactly at the eat trigger so the user can see
// the threshold a fish snout must cross. Inner is 2 px in to give a 2px band.
const RING_BAND_PX = 2;
// Per-instance attribute layout for the ring program: cx, cy, outerR, innerR,
// rgba (4), arcFrac.
const RING_INST_FLOATS = 9;
const RING_CAP = 32; // max fish + treats + cursor with headroom

// Per-instance attribute layout for the arrow program: sx, sy, ex, ey,
// rgba (4), width.
const ARROW_INST_FLOATS = 9;
const ARROW_CAP = 4 * FISH_COUNT + 4; // four components per fish + slack

// Blend the four component colours by their magnitudes so the pip reads as
// "what's pulling on the fish right now". When sated, return SATED_COLOR so
// the cooldown is still visible — the fish ignores treats during that window,
// so the seek term is zero by construction anyway.
function pipColor(
  fish: Fish,
): [number, number, number, number] {
  if (fish.sated) return SATED_COLOR;
  const d = fish.debug;
  const mw = Math.hypot(d.wander.x, d.wander.y);
  const mc = Math.hypot(d.contain.x, d.contain.y);
  const ma = Math.hypot(d.avoid.x, d.avoid.y);
  const ms = Math.hypot(d.seek.x, d.seek.y);
  const total = mw + mc + ma + ms;
  if (total <= 1e-4) return COMP_COLORS.wander;
  const fw = mw / total;
  const fc = mc / total;
  const fa = ma / total;
  const fs = ms / total;
  const r =
    COMP_COLORS.wander[0] * fw + COMP_COLORS.contain[0] * fc +
    COMP_COLORS.avoid[0] * fa + COMP_COLORS.seek[0] * fs;
  const g =
    COMP_COLORS.wander[1] * fw + COMP_COLORS.contain[1] * fc +
    COMP_COLORS.avoid[1] * fa + COMP_COLORS.seek[1] * fs;
  const b =
    COMP_COLORS.wander[2] * fw + COMP_COLORS.contain[2] * fc +
    COMP_COLORS.avoid[2] * fa + COMP_COLORS.seek[2] * fs;
  return [r, g, b, 0.95];
}

class FishBehaviorSketch implements Sketch {
  animated = true;
  private gl: WebGL2RenderingContext;
  private renderer: FishRenderer;
  private treatRenderer: TreatRenderer;
  private fish: Fish[] = [];
  private treats: Treat[] = [];
  // Last cursor position; null when there's no pointer over the canvas. The
  // production behavior uses null to ignore the cursor entirely.
  private mouse: Vec2 | null = null;
  private w = 0;
  private h = 0;
  private treatRadius = TREAT_RADIUS_BASE;
  private eatR2 = (EAT_RADIUS_BASE + TREAT_RADIUS_BASE) ** 2;
  private eatR = EAT_RADIUS_BASE + TREAT_RADIUS_BASE;
  private lastT: number | null = null;
  private treatScratch = new Float32Array(TREAT_CAP * TREAT_INST_FLOATS);

  // Ring overlay: state pips above each fish, eat-radius around treats, the
  // cursor's avoid radius. Single instanced program reused for all three.
  private ringProg: WebGLProgram;
  private ringVao: WebGLVertexArrayObject;
  private ringQuadVbo: WebGLBuffer;
  private ringInstVbo: WebGLBuffer;
  private ringResLoc: WebGLUniformLocation;
  private ringScratch = new Float32Array(RING_CAP * RING_INST_FLOATS);

  // Arrow overlay: one arrow per (fish, component) showing the weighted
  // vector each behaviour contributes to the desired heading.
  private arrowProg: WebGLProgram;
  private arrowVao: WebGLVertexArrayObject;
  private arrowQuadVbo: WebGLBuffer;
  private arrowInstVbo: WebGLBuffer;
  private arrowResLoc: WebGLUniformLocation;
  private arrowScratch = new Float32Array(ARROW_CAP * ARROW_INST_FLOATS);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.renderer = new FishRenderer(gl, {
      shaders: { solidFrag: fishFlatFrag, ellipseFrag: ellipseFlatFrag },
      features: { pattern: false, shadow: false, cast: false },
      enable: { dorsalShadow: false },
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // Single-output FS — figure renders directly to the default framebuffer
    // (no MRT depth attachment like the production scene).
    this.treatRenderer = new TreatRenderer(gl, { depthOutput: false });

    // Ring overlay program — instanced screen-aligned quads with a ring SDF +
    // arc mask in the fragment shader. One program covers state pips,
    // treat-radius rings, and the cursor avoid-radius ring.
    this.ringProg = createProgram(gl, ringVert, ringFrag);
    this.ringResLoc = gl.getUniformLocation(this.ringProg, "u_res")!;
    this.ringVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ringVao);
    this.ringQuadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ringQuadVbo);
    // Two triangles spanning [-1, 1] x [-1, 1].
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1,  1,  1,
      -1, -1,  1,  1, -1,  1,
    ]), gl.STATIC_DRAW);
    const aRingUnit = gl.getAttribLocation(this.ringProg, "a_unit");
    gl.enableVertexAttribArray(aRingUnit);
    gl.vertexAttribPointer(aRingUnit, 2, gl.FLOAT, false, 0, 0);
    this.ringInstVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ringInstVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER, RING_CAP * RING_INST_FLOATS * 4, gl.DYNAMIC_DRAW,
    );
    const stride = RING_INST_FLOATS * 4;
    const ringAttribs: [string, number, number][] = [
      ["i_center", 2, 0],
      ["i_outerR", 1, 2 * 4],
      ["i_innerR", 1, 3 * 4],
      ["i_color", 4, 4 * 4],
      ["i_arcFrac", 1, 8 * 4],
    ];
    for (const [name, size, offset] of ringAttribs) {
      const loc = gl.getAttribLocation(this.ringProg, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);

    // Arrow program — oriented [0,1]x[-1,1] quad expanded along (end-start)
    // in the vertex shader. One draw covers every component vector.
    this.arrowProg = createProgram(gl, arrowVert, arrowFrag);
    this.arrowResLoc = gl.getUniformLocation(this.arrowProg, "u_res")!;
    this.arrowVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.arrowVao);
    this.arrowQuadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowQuadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, -1,  1, -1,  1,  1,
      0, -1,  1,  1,  0,  1,
    ]), gl.STATIC_DRAW);
    const aArrowUnit = gl.getAttribLocation(this.arrowProg, "a_unit");
    gl.enableVertexAttribArray(aArrowUnit);
    gl.vertexAttribPointer(aArrowUnit, 2, gl.FLOAT, false, 0, 0);
    this.arrowInstVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowInstVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER, ARROW_CAP * ARROW_INST_FLOATS * 4, gl.DYNAMIC_DRAW,
    );
    const aStride = ARROW_INST_FLOATS * 4;
    const arrowAttribs: [string, number, number][] = [
      ["i_start", 2, 0],
      ["i_end", 2, 2 * 4],
      ["i_color", 4, 4 * 4],
      ["i_width", 1, 8 * 4],
    ];
    for (const [name, size, offset] of arrowAttribs) {
      const loc = gl.getAttribLocation(this.arrowProg, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, aStride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
  }

  setTheme() {}

  resize({ w, h }: FigureView) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    // World units already track the panel, so the bases are used as authored.
    this.treatRadius = TREAT_RADIUS_BASE;
    this.eatR = EAT_RADIUS_BASE + this.treatRadius;
    this.eatR2 = this.eatR * this.eatR;
    // Spawn the school once. On subsequent resizes the fish stay put — the
    // edge-containment force pushes them back into bounds if the panel
    // shrinks, no need to reseed.
    if (this.fish.length === 0) {
      const sizeScale = FIGURE_FISH_SCALE;
      const maxSizeScale = FIGURE_FISH_MAX;
      for (let i = 0; i < FISH_COUNT; i++) {
        // Stagger initial positions across the canvas so the school doesn't
        // start clumped at the centre.
        const t = (i + 0.5) / FISH_COUNT;
        const origin = { x: w * (0.2 + 0.6 * t), y: h * (0.3 + 0.4 * (i % 2)) };
        this.fish.push(
          createFigureFish({
            origin,
            colors: {
              base: BODY_COLORS[i % BODY_COLORS.length],
              mid: BODY_COLORS[i % BODY_COLORS.length],
              accent: BODY_COLORS[i % BODY_COLORS.length],
              fin: FIN_COLOR,
            },
            sizeScale,
            maxSizeScale,
            cruiseSpeed:
              FIGURE_CRUISE_BASE + (i / FISH_COUNT) * FIGURE_CRUISE_JITTER,
            seed: 0x6f1547a2 ^ (i * 0x9e3779b1),
            noisePhase: {
              heading: 7.3 + i * 11.1, // desync the wander
              speed: 3.7 + i * 5.9,
              mouth: 1.1 + i * 2.5,
            },
          }),
        );
      }
    }
    this.lastT = null;
  }

  pointer(p: PointerInfo) {
    this.mouse = { x: p.x, y: p.y };
    if (p.type === "down") {
      if (this.treats.length >= TREAT_CAP) this.treats.shift();
      this.treats.push({ x: p.x, y: p.y });
    } else if (p.type === "up") {
      // Keep tracking the cursor on hover, just stop spawning treats.
    }
  }

  frame(t: number) {
    const gl = this.gl;
    const { w, h } = this;
    if (w === 0 || h === 0 || this.fish.length === 0) return;
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;

    const treatVecs: Vec2[] = this.treats;
    for (const f of this.fish) {
      f.resolve(dt, this.mouse, treatVecs, w, h, 0);
    }

    // Eat test: any fish snout within EAT_RADIUS of a treat eats it.
    // O(fish * treats); both <= 8, so negligible.
    for (let i = this.treats.length - 1; i >= 0; i--) {
      const t = this.treats[i];
      for (const f of this.fish) {
        const s = f.snout;
        const dx = s.x - t.x;
        const dy = s.y - t.y;
        if (dx * dx + dy * dy < this.eatR2) {
          f.eat();
          this.treats.splice(i, 1);
          break;
        }
      }
    }

    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Treats first so a fish swallowing one paints over the morsel rather
    // than under it.
    const n = this.treats.length;
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        const o = i * TREAT_INST_FLOATS;
        this.treatScratch[o + 0] = this.treats[i].x;
        this.treatScratch[o + 1] = this.treats[i].y;
        this.treatScratch[o + 2] = this.treatRadius;
        this.treatScratch[o + 3] = 0; // depth ignored in flat FS
        this.treatScratch[o + 4] = TREAT_COLOR[0];
        this.treatScratch[o + 5] = TREAT_COLOR[1];
        this.treatScratch[o + 6] = TREAT_COLOR[2];
      }
      this.treatRenderer.draw(this.treatScratch, n, w, h, 0);
    }

    for (const f of this.fish) {
      const geo = f.buildGeometry();
      this.renderer.draw(geo, w, h, 0, 0, 0, 0);
    }

    // Debug overlay on top: state pips above each fish, eat-radius rings
    // around treats, the cursor's avoid-radius ring. All packed into one
    // instanced draw via the shared ring program.
    let ringCount = 0;
    const push = (
      cx: number, cy: number, outerR: number, innerR: number,
      color: [number, number, number, number], arcFrac: number,
    ) => {
      if (ringCount >= RING_CAP) return;
      const o = ringCount * RING_INST_FLOATS;
      this.ringScratch[o + 0] = cx;
      this.ringScratch[o + 1] = cy;
      this.ringScratch[o + 2] = outerR;
      this.ringScratch[o + 3] = innerR;
      this.ringScratch[o + 4] = color[0];
      this.ringScratch[o + 5] = color[1];
      this.ringScratch[o + 6] = color[2];
      this.ringScratch[o + 7] = color[3];
      this.ringScratch[o + 8] = arcFrac;
      ringCount++;
    };
    // State pip per fish, coloured by the blend of behaviour weights so the
    // viewer can see "what's pulling on the fish right now". Sated fish use a
    // shrinking arc that drains over the 2-second cooldown.
    for (const f of this.fish) {
      const head = f.spine.joints[0];
      const color = pipColor(f);
      const arcFrac = f.sated
        ? f.debug.satedRemaining / f.debug.satedDuration
        : 1;
      push(head.x, head.y - PIP_OFFSET_Y, PIP_OUTER_R, PIP_INNER_R,
           color, arcFrac);
    }
    // Treat eat-radius rings (yellow).
    for (const t of this.treats) {
      push(t.x, t.y, this.eatR, this.eatR - RING_BAND_PX, TREAT_RING_COLOR, 1);
    }
    // Cursor avoid-radius ring (red). All fish share the same avoidRadius at
    // this scale, so the first fish's value is representative.
    if (this.mouse && this.fish.length > 0) {
      const r = this.fish[0].debug.avoidRadius;
      push(this.mouse.x, this.mouse.y, r, r - RING_BAND_PX,
           CURSOR_RING_COLOR, 1);
    }
    if (ringCount > 0) {
      gl.useProgram(this.ringProg);
      gl.uniform2f(this.ringResLoc, w, h);
      gl.bindVertexArray(this.ringVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ringInstVbo);
      gl.bufferSubData(
        gl.ARRAY_BUFFER, 0, this.ringScratch, 0,
        ringCount * RING_INST_FLOATS,
      );
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ringCount);
      gl.bindVertexArray(null);
    }

    // Component arrows: one per (fish, component), rooted at the head and
    // pointing along the weighted vector that component contributes to the
    // desired heading. Zero-magnitude components are skipped so the panel
    // doesn't fill with stubs.
    let arrowCount = 0;
    const pushArrow = (
      sx: number, sy: number, ex: number, ey: number,
      color: [number, number, number, number],
    ) => {
      if (arrowCount >= ARROW_CAP) return;
      const o = arrowCount * ARROW_INST_FLOATS;
      this.arrowScratch[o + 0] = sx;
      this.arrowScratch[o + 1] = sy;
      this.arrowScratch[o + 2] = ex;
      this.arrowScratch[o + 3] = ey;
      this.arrowScratch[o + 4] = color[0];
      this.arrowScratch[o + 5] = color[1];
      this.arrowScratch[o + 6] = color[2];
      this.arrowScratch[o + 7] = color[3];
      this.arrowScratch[o + 8] = ARROW_WIDTH;
      arrowCount++;
    };
    const MIN_SQ = 0.04; // ignore components below ~0.2 weight
    for (const f of this.fish) {
      const head = f.spine.joints[0];
      const d = f.debug;
      const comps: [Vec2, [number, number, number, number]][] = [
        [d.wander, COMP_COLORS.wander],
        [d.contain, COMP_COLORS.contain],
        [d.avoid, COMP_COLORS.avoid],
        [d.seek, COMP_COLORS.seek],
      ];
      for (const [v, color] of comps) {
        const m2 = v.x * v.x + v.y * v.y;
        if (m2 < MIN_SQ) continue;
        pushArrow(
          head.x, head.y,
          head.x + v.x * ARROW_SCALE, head.y + v.y * ARROW_SCALE,
          color,
        );
      }
    }
    if (arrowCount > 0) {
      gl.useProgram(this.arrowProg);
      gl.uniform2f(this.arrowResLoc, w, h);
      gl.bindVertexArray(this.arrowVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowInstVbo);
      gl.bufferSubData(
        gl.ARRAY_BUFFER, 0, this.arrowScratch, 0,
        arrowCount * ARROW_INST_FLOATS,
      );
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, arrowCount);
      gl.bindVertexArray(null);
    }
  }

  dispose() {
    const gl = this.gl;
    this.renderer.dispose();
    this.treatRenderer.dispose();
    gl.deleteProgram(this.ringProg);
    gl.deleteVertexArray(this.ringVao);
    gl.deleteBuffer(this.ringQuadVbo);
    gl.deleteBuffer(this.ringInstVbo);
    gl.deleteProgram(this.arrowProg);
    gl.deleteVertexArray(this.arrowVao);
    gl.deleteBuffer(this.arrowQuadVbo);
    gl.deleteBuffer(this.arrowInstVbo);
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new FishBehaviorSketch(host.gl);
  },
};

export default mod;
