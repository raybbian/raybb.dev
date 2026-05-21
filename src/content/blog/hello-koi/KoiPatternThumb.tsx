"use client";

import { useEffect, useRef } from "react";
import { FullscreenShader } from "@/figures/FullscreenShader";
import { pickKoiColors } from "@/sim/koiPattern";
import { mulberry32 } from "@/lib/math";
import FS from "./figures/shaders/koiPattern.frag.glsl";

// The koi pattern shader maps body-uv via `st = (uv.x * ASPECT, uv.y)` with
// ASPECT = 3.0 (see noise.glsl), so feeding equal U/V ranges into a square
// canvas would squash the noise field 3× in X. We pin V_RANGE and derive
// U_RANGE from the canvas aspect so the noise stays isotropic at any size:
//   u_range.x * ASPECT / w == v_range / h  →  u_range.x = v_range * (w/h) / ASPECT
const PAT_U_CENTER = 0.5;
const PAT_V_CENTER = 0.5;
const PAT_V_RANGE = 3.0;
const SHADER_ASPECT = 3.0;

// One-shot koi-pattern preview: picks a fresh palette + seed on mount and
// renders a single frame. Resizes with the host element.
export default function KoiPatternThumb({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const shader = new FullscreenShader(gl, FS);
    const uBase = shader.uniform("u_base");
    const uMid = shader.uniform("u_mid");
    const uAccent = shader.uniform("u_accent");
    const uSeed = shader.uniform("u_seed");
    const uUvCenter = shader.uniform("u_uvCenter");
    const uUvRange = shader.uniform("u_uvRange");

    const seed = (Math.random() * 0xffffffff) >>> 0;
    const colors = pickKoiColors(mulberry32(seed));

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      shader.draw(() => {
        if (uBase)
          gl.uniform3f(uBase, colors.base[0], colors.base[1], colors.base[2]);
        if (uMid)
          gl.uniform3f(uMid, colors.mid[0], colors.mid[1], colors.mid[2]);
        if (uAccent)
          gl.uniform3f(
            uAccent,
            colors.accent[0],
            colors.accent[1],
            colors.accent[2],
          );
        if (uSeed) gl.uniform2fv(uSeed, colors.seed);
        if (uUvCenter) gl.uniform2f(uUvCenter, PAT_U_CENTER, PAT_V_CENTER);
        const uRange = (PAT_V_RANGE * (w / h)) / SHADER_ASPECT;
        if (uUvRange) gl.uniform2f(uUvRange, uRange, PAT_V_RANGE);
      });
    };

    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    draw();

    return () => {
      ro.disconnect();
      shader.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`block h-full w-full ${className ?? ""}`}
    />
  );
}
