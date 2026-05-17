// WebGL2 profiling via context patching. Falls back gracefully where
// EXT_disjoint_timer_query_webgl2 is missing/disabled: gpuMs stays -1.

export interface GlPerf {
  stats: { calls: number; verts: number; tris: number };
  gpuMs: number; // -1 if unavailable
  gpuInfo: string;
  beginFrame(): void;
  endFrame(): void; // reads the previous frame's result (queries are async)
}

export function instrumentGl(gl: WebGL2RenderingContext): GlPerf {
  const stats = { calls: 0, verts: 0, tris: 0 };

  // Some browsers gate the unmasked strings and return generic VENDOR
  // (often "WebKit").
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = gl.getParameter(
    dbg ? dbg.UNMASKED_VENDOR_WEBGL : gl.VENDOR,
  ) as string;

  const self: GlPerf = {
    stats,
    gpuMs: -1,
    gpuInfo: vendor,
    beginFrame,
    endFrame,
  };

  const tris = (mode: number, n: number) =>
    mode === gl.TRIANGLES
      ? n / 3
      : mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN
        ? Math.max(0, n - 2)
        : 0;

  const wrap = (
    name: "drawArrays" | "drawElements" | "drawArraysInstanced" | "drawElementsInstanced",
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
  const pool = ext ? [gl.createQuery()!, gl.createQuery()!] : null;
  let cur = 0;
  let primed = false; // skip the first read: the off-buffer has no query yet

  function beginFrame() {
    stats.calls = 0;
    stats.verts = 0;
    stats.tris = 0;
    if (ext && pool) gl.beginQuery(ext.TIME_ELAPSED_EXT, pool[cur]);
  }

  function endFrame() {
    if (!ext || !pool) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    const prev = pool[cur ^ 1];
    if (
      primed &&
      gl.getQueryParameter(prev, gl.QUERY_RESULT_AVAILABLE) &&
      !gl.getParameter(ext.GPU_DISJOINT_EXT)
    ) {
      self.gpuMs = (gl.getQueryParameter(prev, gl.QUERY_RESULT) as number) / 1e6;
    }
    cur ^= 1;
    if (cur === 0) primed = true;
  }

  return self;
}
