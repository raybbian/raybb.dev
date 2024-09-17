import { MutableRefObject, useEffect, useRef } from "react";
import { VoronoiRenderer } from "@/scripts/render";

const FPS = 60;

export default function Voronoi({ mousePosRef, className }: {
	mousePosRef: MutableRefObject<[number, number]>,
	className?: string,
}) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const voronoiRef = useRef<VoronoiRenderer | null>(null);
	const timeRef = useRef<number>(0);
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
			curFrameTimeRef.current %= (1 / FPS);

			voronoiRef.current.render(delta, mousePosRef.current);
		}

		initVoronoi();
		handleResize();
		render(0);

		return () => {
			window.removeEventListener('resize', handleResize);
			shouldRenderRef.current = false;
		};
	}, [mousePosRef]);

	return (
		<div className={`${className} w-full h-full bg-black`}		>
			<canvas ref={canvasRef} className="w-full h-full opacity-70" />
		</div>
	);
}
