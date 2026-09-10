import type { FigureModule, FigureView, PointerInfo, Sketch } from "@/figures/types";
import { Fish, type FishGeometry } from "@/sim/Fish";
import { CHAIN_LINK_SIZE } from "@/sim/fishBodyMesh";
import { FishRenderer } from "@/render/FishRenderer";
import { PALETTE as P } from "@/figures/palette";
import fishFlatFrag from "@/render/shaders/fishFlat.frag.glsl";
import ellipseFlatFrag from "@/render/shaders/ellipseFlat.frag.glsl";

// The body triangulation the renderer ACTUALLY uses: no ear-clipping. Every
// smoothed boundary point is joined to the spine centerline straight across
// from it (same u), making a ribbon of quads. Note the fan-like spokes to
// the centerline vs. the previous figure's ear-clipped sliver triangles.
// Tap to toggle the wireframe.

const RIBBON_SEGMENTS = 4;
const FLOATS_PER_VERT = 8;
const FIT_PAD = 0.1;

class RibbonSketch implements Sketch {
  animated = false;
  private gl: WebGL2RenderingContext;
  private renderer: FishRenderer;
  private fish: Fish;
  private geo: FishGeometry | null = null;
  private w = 0;
  private h = 0;
  private hideWire = true;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.renderer = new FishRenderer(gl, {
      shaders: { solidFrag: fishFlatFrag, ellipseFrag: ellipseFlatFrag },
      features: { pattern: false, shadow: false, cast: false },
      enable: {
        caudal: false,
        body: true,
        dorsalShadow: false,
        dorsal: false,
        fins: false,
        eyes: false,
      },
    });
    // Static body — never resolve(). Constructor lays the chain out vertically
    // from the origin; pose it horizontally below so the body reads as a
    // side-on koi (head at small x, tail at large x).
    this.fish = new Fish(
      { x: 0, y: 0 },
      {
        base: P.fillGL,
        mid: P.fillGL,
        accent: P.fillGL,
        fin: P.fillGL,
      },
      0,
      1,
      {},
      1,
    );
    const joints = this.fish.spine.joints;
    const angles = this.fish.spine.angles;
    for (let i = 0; i < joints.length; i++) {
      joints[i] = { x: i * CHAIN_LINK_SIZE, y: 0 };
      // head is at joint 0 (smaller x), so the head-direction unit vector
      // (joint[i-1] - joint[i]) points in -x: angle = π.
      angles[i] = Math.PI;
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setTheme() {}

  // Static figure: the fish is built once and fit into the canvas with an
  // internal transform (see `buildAndFit`), so there are no scene-px literals
  // to scale here — world units carry it.
  resize({ w, h }: FigureView) {
    this.w = w;
    this.h = h;
    this.geo = null;
  }

  pointer(p: PointerInfo) {
    if (p.type === "down") this.hideWire = !this.hideWire;
  }

  private buildAndFit(): FishGeometry | null {
    const { w, h } = this;
    if (w === 0 || h === 0) return null;
    // Pull the same FishGeometry the live renderer consumes — pooled inside
    // Fish, body indices already laid out at [bodyIdxStart, shadowIdxStart).
    const geo = this.fish.buildGeometry(1, RIBBON_SEGMENTS);

    // Fit body bbox into the canvas. Caudal/dorsal verts ride along the same
    // transform — they aren't drawn but live in the same buffer.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const v = geo.verts;
    for (let i = geo.bodyIdxStart; i < geo.shadowIdxStart; i++) {
      const off = geo.indices[i] * FLOATS_PER_VERT;
      const x = v[off];
      const y = v[off + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const s = Math.min((w * (1 - FIT_PAD)) / bw, (h * (1 - FIT_PAD)) / bh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (let i = 0; i < geo.vCount; i += FLOATS_PER_VERT) {
      v[i] = w / 2 + (v[i] - cx) * s;
      v[i + 1] = h / 2 + (v[i + 1] - cy) * s;
    }
    return geo;
  }

  frame() {
    const gl = this.gl;
    if (!this.geo) this.geo = this.buildAndFit();
    gl.clearColor(P.bgGL[0], P.bgGL[1], P.bgGL[2], P.bgGL[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.geo) return;
    this.renderer.draw(this.geo, this.w, this.h, 0);
    if (!this.hideWire) {
      this.renderer.drawBodyWireframe(this.geo, this.w, this.h, P.wireGL);
    }
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
    return new RibbonSketch(host.gl);
  },
};

export default mod;
