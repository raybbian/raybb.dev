// Contract between the lazy <Figure> host and an individual figure sketch.
//
// Sketches work entirely in WORLD UNITS (see `lib/worldScale` and
// `figures/units`). The drawing area is always `view.w` x `view.h` units
// regardless of its pixel size, and the host installs the units -> device
// transform before calling `frame`, so a sketch has no scale factor to apply
// and no pixel literal to write. Constants in `src/sim` and `src/render` are
// authored in these same units, so a figure can hand them straight to the
// shared renderers.

export type FigureTheme = "light" | "dark";

export interface FigureView {
  // Drawing area in world units: `w` is always REF_WIDTH, `h` follows the
  // figure's aspect. Lay everything out against these.
  w: number;
  h: number;
  // Device pixels per world unit. Needed only at a boundary that genuinely
  // speaks pixels — sizing an offscreen canvas' backing store, or a shader
  // that feathers an edge in device pixels. Scene geometry never needs it.
  scale: number;
  dpr: number;
}

export interface PointerInfo {
  type: "down" | "move" | "up";
  x: number; // world units, relative to the drawing area's top-left
  y: number;
  // Whether a drag is active (a pointer is currently down).
  down: boolean;
}

export interface Sketch {
  resize(view: FigureView): void;
  frame(t: number, dt: number): void;
  setTheme(theme: FigureTheme): void;
  pointer?(p: PointerInfo): void;
  dispose(): void;
  // false => static: the host draws one frame instead of a rAF loop, and
  // redraws on resize / theme / pointer.
  animated?: boolean;
}

export type SketchHost =
  | { kind: "2d"; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }
  | { kind: "webgl2"; canvas: HTMLCanvasElement; gl: WebGL2RenderingContext };

export interface FigureModule {
  kind: "2d" | "webgl2";
  // width / height — reserves layout space and sets the canvas size.
  aspect: number;
  create(host: SketchHost, theme: FigureTheme): Sketch;
}
