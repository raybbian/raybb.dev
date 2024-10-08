import { vec2, vec3 } from "gl-matrix";

export const MAX_POINTS = 256;

class Point {
	pos: vec2;
	vel: vec2;

	constructor(pos: vec2, vel: vec2) {
		this.pos = pos;
		this.vel = vel;
	}

	simulate(deltaTime: number) {
		this.pos[0] += this.vel[0] * deltaTime;
		this.pos[1] += this.vel[1] * deltaTime;
	}
}

export class Voronoi {
	numPoints: number = 0;
	points: Point[];

	positions: Float32Array;
	ids: Float32Array;
	colors: Float32Array;

	curTime: number = 0;

	constructor(numPoints: number, screenSize: vec2, colors: vec3[]) {
		this.points = new Array(MAX_POINTS);
		this.positions = new Float32Array(MAX_POINTS * 2);
		this.ids = new Float32Array(this.points.keys());
		this.colors = new Float32Array(MAX_POINTS * 3);

		this.initPoints(numPoints, screenSize);

		for (let i = 0; i < MAX_POINTS; i++) {
			const color = colors[Math.floor(Math.random() * colors.length)];
			this.colors[3 * i] = color[0] / 256;
			this.colors[3 * i + 1] = color[1] / 256;
			this.colors[3 * i + 2] = color[2] / 256;
		}
	}

	/// initialize points in array for numPoints + 1 (mouse point will be overwritten on simulate)
	initPoints(numPoints: number, screenSize: vec2) {
		this.numPoints = numPoints + 1;
		for (let i = 0; i <= this.numPoints; i++) {
			const pos: vec2 = [Math.random() * screenSize[0], Math.random() * screenSize[1]];
			const vel: vec2 = [Math.random() * 10 - 5, Math.random() * 10 - 5];
			this.points[i] = new Point(pos, vel);
		}
	}

	simulate(deltaTime: number, screenSize: vec2) {
		this.points.forEach((point, i) => {
			for (let i = 0; i < 2; i++) {
				if (point.pos[i] > screenSize[i]) {
					point.vel[i] = -1 * Math.abs(point.vel[i]);
					point.pos[i] = screenSize[i];
				} else if (point.pos[i] < 0) {
					point.vel[i] = Math.abs(point.vel[i]);
					point.pos[i] = 0;
				}
			}
			point.simulate(deltaTime);

			this.positions[2 * i] = this.points[i].pos[0];
			this.positions[2 * i + 1] = this.points[i].pos[1];
		});
	}
}
