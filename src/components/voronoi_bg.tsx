import { useEffect, useRef } from "react";
import { VoronoiRenderer } from "@/scripts/render";


export function VoronoiBg() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const voronoiRef = useRef<VoronoiRenderer | null>(null);

	useEffect(() => {
		function handleResize() {
			const canvas = canvasRef.current;
			const voronoi = voronoiRef.current;
			if (canvas == null || voronoi == null) return;
			if (canvas.width == canvas.clientWidth && canvas.height == canvas.clientHeight) return;
			canvas.width = canvas.clientWidth;
			canvas.height = canvas.clientHeight;
			voronoi.changeResolution([canvas.width, canvas.height]);
		}

		window.addEventListener('resize', handleResize);

		function initVoronoi() {
			const canvas = canvasRef.current;
			const gl = canvas?.getContext('webgl2');
			if (canvas == null || gl == null) return;
			voronoiRef.current = new VoronoiRenderer(gl, 100, [canvas.clientWidth, canvas.clientHeight]);
		}

		function render(time: number) {
			if (voronoiRef.current == null) return;
			voronoiRef.current.render(time);
			requestAnimationFrame(render);
		}

		initVoronoi();
		handleResize();
		render(0);

		return () => window.removeEventListener('resize', handleResize);
	}, []);

	return (
		<div className="w-full h-full">
			<canvas ref={canvasRef} className="w-full h-full" />
		</div>
	);
}
