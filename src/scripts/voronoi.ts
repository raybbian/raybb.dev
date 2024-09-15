import { vec2 } from "gl-matrix";

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
	numPoints: number;
	points: Point[];

	positions: Float32Array;
	ids: Float32Array;
	colors: Float32Array;

	curTime: number = 0;

	constructor(numPoints: number, screenSize: vec2, colors: [number, number, number][]) {
		this.numPoints = numPoints;
		this.points = new Array(numPoints);
		this.positions = new Float32Array(numPoints * 2);
		this.ids = new Float32Array(this.points.keys());
		this.colors = new Float32Array(numPoints * 3);
		for (let i = 0; i < numPoints; i++) {
			const pos: vec2 = [Math.random() * screenSize[0], Math.random() * screenSize[1]];
			const vel: vec2 = [Math.random() * 30 - 15, Math.random() * 30 - 15];
			this.points[i] = new Point(pos, vel);
			const color = colors[Math.floor(Math.random() * colors.length)];
			for (let j = 0; j < 3; j++)
				this.colors[3 * i + j] = color[j] / 256;
		}
	}

	simulate(deltaTime: number, screenSize: vec2) {
		this.points.forEach((point, i) => {
			point.simulate(deltaTime);
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
			this.positions[2 * i] = this.points[i].pos[0];
			this.positions[2 * i + 1] = this.points[i].pos[1];
		});
	}
}
