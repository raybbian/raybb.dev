// WebGL2 profiling via context patching. Falls back gracefully where
// EXT_disjoint_timer_query_webgl2 is missing/disabled: gpuMs / passes stay
// empty.

export interface GlPerf {
  stats: { calls: number; verts: number; tris: number };
  // ms per labelled region, populated when EXT_disjoint_timer_query_webgl2 is
  // available. Each pass is double-buffered as a FIFO and drained as soon as
  // the driver reports the result available, so latency tracks the GPU's
  // actual queue depth (typically 1–3 frames). Insertion-order matches the
  // frame's first pass() call so overlay rows stay in pipeline order.
  passes: Map<string, number>;
  gpuMs: number; // -1 if unavailable, else sum of `passes` values
  gpuInfo: string;
  beginFrame(): void;
  // Closes any open region and opens a new TIME_ELAPSED query labelled `name`.
  // Calling pass() with the same name twice in one frame is ignored (the first
  // region wins) — split into distinct labels if you need separate readings.
  pass(name: string): void;
  // Explicitly closes the current region. Optional; endFrame() also closes it.
  endPass(): void;
  endFrame(): void;
}

// Cap per-slot in-flight queries so a stalled GPU can't grow the queue
// without bound. At 60fps this is ~MAX_INFLIGHT/60 s of unread history.
const MAX_INFLIGHT = 8;

export function instrumentGl(gl: WebGL2RenderingContext): GlPerf {
  const stats = { calls: 0, verts: 0, tris: 0 };

  // Some browsers gate the unmasked strings and return generic VENDOR
  // (often "WebKit").
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = gl.getParameter(
    dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR,
  ) as string;

  const passes = new Map<string, number>();
  const self: GlPerf = {
    stats,
    passes,
    gpuMs: -1,
    gpuInfo: vendor,
    beginFrame,
    pass,
    endPass,
    endFrame,
  };

  const tris = (mode: number, n: number) =>
    mode === gl.TRIANGLES
      ? n / 3
      : mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN
        ? Math.max(0, n - 2)
        : 0;

  const wrap = (
    name:
      | "drawArrays"
      | "drawElements"
      | "drawArraysInstanced"
      | "drawElementsInstanced",
    vIdx: number,
    iIdx: number,
  ) => {
    const orig = (gl[name] as (...a: unknown[]) => void).bind(gl);
    (gl as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
      const inst = iIdx < 0 ? 1 : (a[iIdx] as number);
      const v = a[vIdx] as number;
      stats.calls++;
      stats.verts += v * inst;
      stats.tris += tris(a[0] as number, v) * inst;
      orig(...a);
    };
  };
  wrap("drawArrays", 2, -1); // (mode, first, count)
  wrap("drawElements", 1, -1); // (mode, count, type, offset)
  wrap("drawArraysInstanced", 2, 3); // (mode, first, count, instanceCount)
  wrap("drawElementsInstanced", 1, 4); // (mode, count, type, offset, instanceCount)

  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;

  // FIFO per labelled region. WebGL2 forbids overlapping TIME_ELAPSED queries
  // (only one active per target), so pass() closes the previous region
  // before opening the next. Finished queries are recycled via `free`.
  interface Slot {
    inflight: WebGLQuery[]; // oldest first
    free: WebGLQuery[];
    hadThisFrame: boolean;
  }
  const slots = new Map<string, Slot>();
  let active: { slot: Slot; query: WebGLQuery } | null = null;

  function getSlot(name: string): Slot {
    let s = slots.get(name);
    if (s) return s;
    s = { inflight: [], free: [], hadThisFrame: false };
    slots.set(name, s);
    return s;
  }

  function closeActive() {
    if (!ext || !active) {
      active = null;
      return;
    }
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    active.slot.inflight.push(active.query);
    active = null;
  }

  function beginFrame() {
    stats.calls = 0;
    stats.verts = 0;
    stats.tris = 0;
    for (const s of slots.values()) s.hadThisFrame = false;
  }

  function pass(name: string) {
    closeActive();
    if (!ext) return;
    const s = getSlot(name);
    if (s.hadThisFrame) return; // first region per name wins
    s.hadThisFrame = true;
    // Driver isn't draining (queue full): skip this frame's reading rather
    // than reusing an in-flight handle (undefined behavior). The slot keeps
    // its prior `passes.get(name)` value so the overlay row doesn't drop.
    if (s.inflight.length >= MAX_INFLIGHT) return;
    const q = s.free.pop() ?? gl.createQuery()!;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    active = { slot: s, query: q };
  }

  function endPass() {
    closeActive();
  }

  function endFrame() {
    closeActive();
    if (!ext) return;
    const disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
    // Drain every slot's finished queries from the front. This decouples
    // overlay refresh from GPU queue depth: pull as many readings as the
    // driver has ready, not just one per frame.
    for (const [name, s] of slots) {
      while (s.inflight.length > 0) {
        const q = s.inflight[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!disjoint) {
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
          passes.set(name, ns / 1e6);
        }
        s.inflight.shift();
        s.free.push(q);
      }
    }
    let total = 0;
    let any = false;
    for (const v of passes.values()) {
      total += v;
      any = true;
    }
    self.gpuMs = any ? total : -1;
  }

  return self;
}
