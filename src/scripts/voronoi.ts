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

	constructor(numPoints: number, screenSize: vec2, colors: vec3[], accentColor: vec3) {
		this.points = new Array(MAX_POINTS);
		this.positions = new Float32Array(MAX_POINTS * 2);
		this.ids = new Float32Array(this.points.keys());
		this.colors = new Float32Array(MAX_POINTS * 3);

		this.initPoints(numPoints, screenSize);

		for (let i = 1; i < MAX_POINTS; i++) {
			const color = colors[Math.floor(Math.random() * colors.length)];
			this.colors[3 * i] = color[0] / 256;
			this.colors[3 * i + 1] = color[1] / 256;
			this.colors[3 * i + 2] = color[2] / 256;
		}
		this.colors[0] = accentColor[0] / 256;
		this.colors[1] = accentColor[1] / 256;
		this.colors[2] = accentColor[2] / 256;
	}

	/// initialize points in array for numPoints + 1 (mouse point will be overwritten on simulate)
	initPoints(numPoints: number, screenSize: vec2) {
		this.numPoints = numPoints + 1;
		for (let i = 0; i <= this.numPoints; i++) {
			const pos: vec2 = [Math.random() * screenSize[0], Math.random() * screenSize[1]];
			const vel: vec2 = [Math.random() * 30 - 15, Math.random() * 30 - 15];
			this.points[i] = new Point(pos, vel);
		}
	}

	simulate(deltaTime: number, screenSize: vec2, mousePos: vec2) {
		this.points.forEach((point, i) => {
			if (point.pos[0] > screenSize[0]) {
				point.vel[0] = -1 * Math.abs(point.vel[0]);
			} else if (point.pos[0] < 0) {
				point.vel[0] = Math.abs(point.vel[0]);
			}
			if (point.pos[1] > screenSize[1]) {
				point.vel[1] = -1 * Math.abs(point.vel[1]);
			} else if (point.pos[1] < 0) {
				point.vel[1] = Math.abs(point.vel[1]);
			}
			point.simulate(deltaTime);
			this.positions[2 * i] = this.points[i].pos[0];
			this.positions[2 * i + 1] = this.points[i].pos[1];
		});
		this.positions[0] = mousePos[0];
		this.positions[1] = mousePos[1];
	}
}
