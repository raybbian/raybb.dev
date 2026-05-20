import type { FigureModule, PointerInfo, Sketch } from "@/figures/types";
import { Fish } from "@/sim/Fish";
import { FishRenderer } from "@/render/FishRenderer";
import { PALETTE as P } from "@/figures/palette";
import { createProgram, unitCircleMesh } from "@/lib/gl";
import fishFlatFrag from "@/render/shaders/fishFlat.frag.glsl";
import ellipseFlatFrag from "@/render/shaders/ellipseFlat.frag.glsl";
import treatVert from "./shaders/fishBehaviorTreat.vert.glsl";
import treatFrag from "./shaders/fishBehaviorTreat.frag.glsl";
import ringVert from "./shaders/fishBehaviorRing.vert.glsl";
import ringFrag from "./shaders/fishBehaviorRing.frag.glsl";
import type { Vec2 } from "@/lib/math";

// World == canvas: every fish stays visible. No camera follow.
const FISH_BASE_SCALE = 0.28;
const FISH_MAX_SCALE = 0.55;
const SCREEN_SCALE = 0.4; // matches fishSwim — sense radii feel right at this size
const FISH_COUNT = 4;
const TREAT_CAP = 8;
const TREAT_RADIUS_PX = 7;
const EAT_RADIUS_PX = 26; // matches Treats.EAT_EXTRA + small slack

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
const TREAT_INST_FLOATS = 3; // cx, cy, radius

// ----- Debug overlay (state pips + radii) -----------------------------------
//
// State -> colour. Wander stays muted so a school of idling fish doesn't
// flood the panel with rings; the eventful states (seek/flee) stand out, and
// sated reads as a calmed-down blue.
const STATE_COLORS = {
  wander: [0.55, 0.63, 0.71, 0.55] as [number, number, number, number],
  seek:   [0.31, 0.78, 0.47, 0.95] as [number, number, number, number],
  flee:   [0.94, 0.36, 0.36, 0.95] as [number, number, number, number],
  sated:  [0.47, 0.63, 0.86, 0.95] as [number, number, number, number],
};
type FishState = keyof typeof STATE_COLORS;

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

function classifyState(
  fish: Fish, mouse: Vec2 | null, treats: Vec2[],
): FishState {
  if (fish.sated) return "sated";
  const head = fish.spine.joints[0];
  const { avoidRadius, seekRadius } = fish.debug;
  if (mouse) {
    const dx = head.x - mouse.x;
    const dy = head.y - mouse.y;
    if (dx * dx + dy * dy < avoidRadius * avoidRadius) return "flee";
  }
  const snout = fish.snout;
  const sr2 = seekRadius * seekRadius;
  for (const t of treats) {
    const dx = t.x - snout.x;
    const dy = t.y - snout.y;
    if (dx * dx + dy * dy < sr2) return "seek";
  }
  return "wander";
}

class FishBehaviorSketch implements Sketch {
  animated = true;
  private gl: WebGL2RenderingContext;
  private renderer: FishRenderer;
  private fish: Fish[] = [];
  private treats: Treat[] = [];
  // Last cursor position; null when there's no pointer over the canvas. The
  // production behavior uses null to ignore the cursor entirely.
  private mouse: Vec2 | null = null;
  private w = 0;
  private h = 0;
  private lastT: number | null = null;

  // Treat circle program — TreatRenderer in src/render emits two MRT outputs
  // for the water pass to sample submergence; here we render straight to the
  // default framebuffer, so a stripped single-output program is simpler than
  // reusing it.
  private treatProg: WebGLProgram;
  private treatVao: WebGLVertexArrayObject;
  private treatCircleVbo: WebGLBuffer;
  private treatInstVbo: WebGLBuffer;
  private treatCircleCount: number;
  private treatResLoc: WebGLUniformLocation;
  private treatColorLoc: WebGLUniformLocation;
  private treatScratch = new Float32Array(TREAT_CAP * TREAT_INST_FLOATS);

  // Ring overlay: state pips above each fish, eat-radius around treats, the
  // cursor's avoid radius. Single instanced program reused for all three.
  private ringProg: WebGLProgram;
  private ringVao: WebGLVertexArrayObject;
  private ringQuadVbo: WebGLBuffer;
  private ringInstVbo: WebGLBuffer;
  private ringResLoc: WebGLUniformLocation;
  private ringScratch = new Float32Array(RING_CAP * RING_INST_FLOATS);

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.renderer = new FishRenderer(gl, {
      shaders: { solidFrag: fishFlatFrag, ellipseFrag: ellipseFlatFrag },
      features: { pattern: false, shadow: false, cast: false },
      enable: { dorsalShadow: false },
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.treatProg = createProgram(gl, treatVert, treatFrag);
    this.treatResLoc = gl.getUniformLocation(this.treatProg, "u_res")!;
    this.treatColorLoc = gl.getUniformLocation(this.treatProg, "u_color")!;
    const circle = unitCircleMesh(24);
    this.treatCircleCount = circle.length / 2;
    this.treatVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.treatVao);
    this.treatCircleVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.treatCircleVbo);
    gl.bufferData(gl.ARRAY_BUFFER, circle, gl.STATIC_DRAW);
    const aUnit = gl.getAttribLocation(this.treatProg, "a_unit");
    gl.enableVertexAttribArray(aUnit);
    gl.vertexAttribPointer(aUnit, 2, gl.FLOAT, false, 0, 0);
    this.treatInstVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.treatInstVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      TREAT_CAP * TREAT_INST_FLOATS * 4,
      gl.DYNAMIC_DRAW,
    );
    const aCenter = gl.getAttribLocation(this.treatProg, "i_center");
    gl.enableVertexAttribArray(aCenter);
    gl.vertexAttribPointer(aCenter, 2, gl.FLOAT, false, TREAT_INST_FLOATS * 4, 0);
    gl.vertexAttribDivisor(aCenter, 1);
    const aRad = gl.getAttribLocation(this.treatProg, "i_radius");
    gl.enableVertexAttribArray(aRad);
    gl.vertexAttribPointer(aRad, 1, gl.FLOAT, false, TREAT_INST_FLOATS * 4, 2 * 4);
    gl.vertexAttribDivisor(aRad, 1);
    gl.bindVertexArray(null);

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
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    // Spawn the school once. On subsequent resizes the fish stay put — the
    // edge-containment force pushes them back into bounds if the panel
    // shrinks, no need to reseed.
    if (this.fish.length === 0) {
      for (let i = 0; i < FISH_COUNT; i++) {
        // Stagger initial positions across the canvas so the school doesn't
        // start clumped at the centre.
        const t = (i + 0.5) / FISH_COUNT;
        const origin = { x: w * (0.2 + 0.6 * t), y: h * (0.3 + 0.4 * (i % 2)) };
        this.fish.push(
          new Fish(
            origin,
            {
              base: BODY_COLORS[i % BODY_COLORS.length],
              mid: BODY_COLORS[i % BODY_COLORS.length],
              accent: BODY_COLORS[i % BODY_COLORS.length],
              fin: FIN_COLOR,
            },
            0.4,
            FISH_BASE_SCALE,
            {
              noisePhaseHeading: 7.3 + i * 11.1, // desync the wander
              noisePhaseSpeed: 3.7 + i * 5.9,
              noisePhaseMouth: 1.1 + i * 2.5,
              seed: 0x6f1547a2 ^ (i * 0x9e3779b1),
            },
            SCREEN_SCALE,
            FISH_MAX_SCALE,
          ),
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
    const eatR = EAT_RADIUS_PX * SCREEN_SCALE + TREAT_RADIUS_PX;
    const eatR2 = eatR * eatR;
    for (let i = this.treats.length - 1; i >= 0; i--) {
      const t = this.treats[i];
      for (const f of this.fish) {
        const s = f.snout;
        const dx = s.x - t.x;
        const dy = s.y - t.y;
        if (dx * dx + dy * dy < eatR2) {
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
    if (this.treats.length > 0) {
      const n = this.treats.length;
      for (let i = 0; i < n; i++) {
        this.treatScratch[i * 3 + 0] = this.treats[i].x;
        this.treatScratch[i * 3 + 1] = this.treats[i].y;
        this.treatScratch[i * 3 + 2] = TREAT_RADIUS_PX;
      }
      gl.useProgram(this.treatProg);
      gl.uniform2f(this.treatResLoc, w, h);
      gl.uniform3f(
        this.treatColorLoc, TREAT_COLOR[0], TREAT_COLOR[1], TREAT_COLOR[2],
      );
      gl.bindVertexArray(this.treatVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.treatInstVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.treatScratch, 0, n * TREAT_INST_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.treatCircleCount, n);
      gl.bindVertexArray(null);
    }

    for (const f of this.fish) {
      const geo = f.buildGeometry();
      this.renderer.draw(geo, w, h, 0);
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
    // State pip per fish. Sated fish use a shrinking arc that drains over the
    // 2-second cooldown, so the user can see exactly how long until the fish
    // is hungry again.
    for (const f of this.fish) {
      const head = f.spine.joints[0];
      const state = classifyState(f, this.mouse, this.treats);
      const color = STATE_COLORS[state];
      const arcFrac = state === "sated"
        ? f.debug.satedRemaining / f.debug.satedDuration
        : 1;
      push(head.x, head.y - PIP_OFFSET_Y, PIP_OUTER_R, PIP_INNER_R,
           color, arcFrac);
    }
    // Treat eat-radius rings (yellow).
    for (const t of this.treats) {
      push(t.x, t.y, eatR, eatR - RING_BAND_PX, TREAT_RING_COLOR, 1);
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
  }

  dispose() {
    const gl = this.gl;
    this.renderer.dispose();
    gl.deleteProgram(this.treatProg);
    gl.deleteVertexArray(this.treatVao);
    gl.deleteBuffer(this.treatCircleVbo);
    gl.deleteBuffer(this.treatInstVbo);
    gl.deleteProgram(this.ringProg);
    gl.deleteVertexArray(this.ringVao);
    gl.deleteBuffer(this.ringQuadVbo);
    gl.deleteBuffer(this.ringInstVbo);
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
