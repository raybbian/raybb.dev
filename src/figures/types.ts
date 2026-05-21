// Contract between the lazy <Figure> host and an individual figure sketch.
// Sketches work in CSS pixels; the host hands them `dpr` so they can scale
// the backing store themselves (2d: setTransform, webgl: viewport).

export type FigureTheme = "light" | "dark";

export interface PointerInfo {
  type: "down" | "move" | "up";
  x: number; // CSS px, relative to canvas top-left
  y: number;
  // Whether a drag is active (a pointer is currently down).
  down: boolean;
}

export interface Sketch {
  // `screenScale` is figureScreenScale(width) computed by the host. Every
  // scene-rendering pixel literal (text, stroke widths on rendered scene
  // geometry, shadow offsets / margin / wavy gain) MUST go through
  // `figurePx` / `figureFont` from `@/figures/scale` (or, for shadow uniforms,
  // the post-local shadow helpers — see `shadowHelpers.ts` under
  // `src/content/blog/hello-koi/figures/`). UI affordances — slider
  // knobs/tracks, divider widths, draggable grabber radii, arrow heads,
  // hit-test tolerances — stay at constant logical px so touch targets remain
  // usable at every viewport.
  resize(
    width: number,
    height: number,
    dpr: number,
    screenScale: number,
  ): void;
  frame(t: number, dt: number): void;
  setTheme(theme: FigureTheme): void;
  pointer?(p: PointerInfo): void;
  dispose(): void;
  // false ⇒ static: the host draws one frame instead of a rAF loop, and
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
