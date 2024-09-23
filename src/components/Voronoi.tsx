import { useEffect, useRef } from "react";
import { VoronoiRenderer } from "@/scripts/render";

const FPS = 24;

export default function Voronoi({ className }: {
	className?: string,
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const voronoiRef = useRef<VoronoiRenderer | null>(null);
	const timeRef = useRef<number>(0);
	const lastFrameTimeRef = useRef<number>(0);
	const curFrameTimeRef = useRef<number>(0);
	const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const shouldRenderRef = useRef(true);

	useEffect(() => {
		function handleResize() {
			//prevent rapid resizes (dragging) from retriggering lots of resizes
			if (resizeTimeoutRef.current != null) {
				clearTimeout(resizeTimeoutRef.current);
			}
			resizeTimeoutRef.current = setTimeout(() => {
				const canvas = canvasRef.current;
				const voronoi = voronoiRef.current;
				if (canvas == null || voronoi == null) return;
				if (canvas.clientHeight == 0 || canvas.clientWidth == 0) return;
				if (canvas.width == canvas.clientWidth && canvas.height == canvas.clientHeight) return;
				canvas.width = canvas.clientWidth;
				canvas.height = canvas.clientHeight;
				voronoi.changeResolution([canvas.width, canvas.height]);
			}, 50);
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
			if (!shouldRenderRef.current) return;

			time /= 1000;
			const delta = time - timeRef.current;
			timeRef.current = time;
			curFrameTimeRef.current += delta;

			requestAnimationFrame(render);

			if (curFrameTimeRef.current < 1 / FPS) return;
			voronoiRef.current.render(timeRef.current - lastFrameTimeRef.current);
			curFrameTimeRef.current %= (1 / FPS);
			lastFrameTimeRef.current = timeRef.current;
		}

		initVoronoi();
		handleResize();
		render(0);

		return () => {
			window.removeEventListener('resize', handleResize);
			shouldRenderRef.current = false;
		};
	}, []);

	return (
		<div className={`${className} w-full h-full bg-black`}		>
			<canvas ref={canvasRef} className="w-full h-full opacity-70" />
		</div>
	);
}
