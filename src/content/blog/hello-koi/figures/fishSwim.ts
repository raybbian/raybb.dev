import type { FigureModule, Sketch } from "@/figures/types";
import { Fish, type FishGeometry } from "@/sim/Fish";
import { FishRenderer } from "@/render/FishRenderer";
import { PALETTE as P } from "@/figures/palette";
import fishFlatFrag from "@/render/shaders/fishFlat.frag.glsl";
import ellipseFlatFrag from "@/render/shaders/ellipseFlat.frag.glsl";

const FIGURE_SCALE = 0.4;
const FIGURE_SEED = 0x6f1547a2;
const FIGURE_NOISE_PHASE = 11.3;
const WORLD_MULT = 3;

// PALETTE.accent ("#2dd4bf") full opacity for the body; darker teal for the
// caudal/dorsal/pectoral/ventral fins. The flat shaders emit a_color
// directly, so passing these on the Fish itself routes them through
// FishRenderer.draw() exactly as the production renderer would.
const BODY_COLOR: [number, number, number, number] = [0.176, 0.831, 0.749, 1.0];
const FIN_COLOR: [number, number, number, number] = [0.13, 0.62, 0.56, 1.0];

// Translate the just-built FishGeometry in place so the head lands at
// (cx, cy) in canvas space. The renderer's vertex shader expects positions
// in u_res-space; head-centring here is cheaper than threading an offset
// uniform through every program.
function shiftGeometryToHead(
  geo: FishGeometry,
  headX: number,
  headY: number,
  cx: number,
  cy: number,
) {
  const dx = cx - headX;
  const dy = cy - headY;
  const vs = geo.verts;
  for (let i = 0; i < geo.vCount; i += 8) {
    vs[i] += dx;
    vs[i + 1] += dy;
  }
  const fi = geo.finInstances;
  for (let i = 0; i < geo.finCount; i += 9) {
    fi[i] += dx;
    fi[i + 1] += dy;
  }
  const ei = geo.eyeInstances;
  for (let i = 0; i < geo.eyeCount; i += 9) {
    ei[i] += dx;
    ei[i + 1] += dy;
  }
}

class SwimSketch implements Sketch {
  animated = true;
  private gl: WebGL2RenderingContext;
  private renderer: FishRenderer;
  private w = 0;
  private h = 0;
  private worldW = 0;
  private worldH = 0;
  private fish: Fish | null = null;
  private lastT: number | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Flat-color, no-pattern, no-shadow renderer. Dorsal self-shadow band is
    // off too: it's a fake (multiply-darken) caster that needs the patterned
    // body underneath to make sense.
    this.renderer = new FishRenderer(gl, {
      shaders: { solidFrag: fishFlatFrag, ellipseFrag: ellipseFlatFrag },
      features: { pattern: false, shadow: false, cast: false },
      enable: { dorsalShadow: false },
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setTheme() {}

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (w === 0 || h === 0) return;
    this.worldW = w * WORLD_MULT;
    this.worldH = h * WORLD_MULT;
    this.fish = new Fish(
      { x: this.worldW / 2, y: this.worldH / 2 },
      {
        base: BODY_COLOR,
        mid: BODY_COLOR,
        accent: BODY_COLOR,
        fin: FIN_COLOR,
      },
      0.4,
      FIGURE_SCALE,
      { noisePhaseHeading: FIGURE_NOISE_PHASE, seed: FIGURE_SEED },
      FIGURE_SCALE,
    );
    this.lastT = null;
  }

  frame(t: number) {
    const gl = this.gl;
    const { w, h, fish } = this;
    if (w === 0 || h === 0 || !fish) return;
    const dt = this.lastT == null ? 0 : Math.min(0.1, t - this.lastT);
    this.lastT = t;
    fish.resolve(dt, null, [], this.worldW, this.worldH, 0);
    const geo = fish.buildGeometry();

    // Camera = head. Head lands at canvas centre; body extends out around it.
    const head = fish.spine.joints[0];
    shiftGeometryToHead(geo, head.x, head.y, w / 2, h / 2);

    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.renderer.draw(geo, w, h, 0);
  }

  dispose() {
    this.renderer.dispose();
  }
}

const mod: FigureModule = {
  kind: "webgl2",
  aspect: 2.4,
  create(host) {
    if (host.kind !== "webgl2") throw new Error("expected webgl2 host");
    return new SwimSketch(host.gl);
  },
};

export default mod;
