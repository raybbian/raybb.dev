import { initShaderProgram } from "./gl";
import ConeVertShaderSrc from "@/shaders/cone_vert.glsl"
import ConeFragShaderSrc from "@/shaders/cone_frag.glsl"
import { generateCone } from "./shapes";
import { vec2 } from "gl-matrix";
import { Voronoi } from "./voronoi";

/// Note: we must add 1 to all occurrences of this because the triangle fan needs one more point to close off the loop
const POINTS_PER_CONE: number = 65;
const CONE_RADIUS: number = 1000;

export class VoronoiRenderer {
	gl: WebGL2RenderingContext;
	voronoi: Voronoi;
	curTime: number = 0;
	resolution: vec2;

	// NOTE: Cone program
	coneProgram: WebGLProgram;
	coneVAO: WebGLVertexArrayObject;
	conePositionBuffer: WebGLBuffer;

	// NOTE: Edge Program
	edgeProgram: WebGLProgram | null = null;
	edgeVAO: WebGLVertexArrayObject | null = null;

	textures: WebGLTexture[] | null[] = [null, null];
	framebuffers: WebGLFramebuffer[] | null[] = [null, null];

	constructor(gl: WebGL2RenderingContext, numPoints: number, resolution: vec2) {
		this.gl = gl;
		this.voronoi = new Voronoi(numPoints, resolution);
		this.resolution = resolution;

		const coneProgram = initShaderProgram(gl, ConeVertShaderSrc, ConeFragShaderSrc);
		if (coneProgram == null) throw new Error("Failed to init cone program.");
		this.coneProgram = coneProgram;
		const coneVAO = gl.createVertexArray();
		if (coneVAO == null) throw new Error("Failed to init cone VAO");
		this.coneVAO = coneVAO;
		const conePositionBuffer = gl.createBuffer();
		if (conePositionBuffer == null) throw new Error("Failed to init cone position buffer");
		this.conePositionBuffer = conePositionBuffer;

		gl.useProgram(this.coneProgram);
		gl.enable(gl.DEPTH_TEST);
		gl.bindVertexArray(this.coneVAO);

		// initialize the vertices of the cone
		const shapeLocation = gl.getAttribLocation(this.coneProgram, 'aShapePosition');
		const shapeBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, shapeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, generateCone(CONE_RADIUS, POINTS_PER_CONE), gl.STATIC_DRAW);
		// set up attribute array for vertex positions for cone
		gl.enableVertexAttribArray(shapeLocation);
		gl.vertexAttribPointer(shapeLocation, 3, gl.FLOAT, false, 0, 0);

		// Initialize position instance array
		const positionLocation = gl.getAttribLocation(this.coneProgram, 'aPosition');
		gl.bindBuffer(gl.ARRAY_BUFFER, this.conePositionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.voronoi.numPoints * 2), gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(positionLocation);
		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(positionLocation, 1);

		// Initialize index instance array
		const indexLocation = gl.getAttribLocation(this.coneProgram, 'aIndex');
		const indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, indexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(Array.from(Array(this.voronoi.numPoints).keys())), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(indexLocation);
		gl.vertexAttribPointer(indexLocation, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(indexLocation, 1);

		// Initialize num points uniform
		const numPointsUniform = gl.getUniformLocation(this.coneProgram, 'uNumPoints');
		gl.uniform1f(numPointsUniform, this.voronoi.numPoints);
	}

	changeResolution(size: vec2) {
		const gl = this.gl;
		const curProgram = gl.getParameter(gl.CURRENT_PROGRAM);

		gl.viewport(0, 0, size[0], size[1]);
		gl.useProgram(this.coneProgram);
		const resolutionUniform = gl.getUniformLocation(this.coneProgram, 'uResolution');
		gl.uniform2f(resolutionUniform, size[0], size[1]);

		// TODO: other programs

		gl.useProgram(curProgram);
	}

	render(time: number) {
		const gl = this.gl;
		time *= 0.001;
		const deltaTime = time - this.curTime;
		this.curTime = time;

		this.voronoi.simulate(deltaTime, this.resolution);

		gl.useProgram(this.coneProgram);
		gl.bindVertexArray(this.coneVAO);

		const positionArray = new Float32Array(this.voronoi.numPoints * 2)
		for (let i = 0; i < this.voronoi.numPoints; i++) {
			positionArray[2 * i] = this.voronoi.points[i].pos[0];
			positionArray[2 * i + 1] = this.voronoi.points[i].pos[1];
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.conePositionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionArray);

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, POINTS_PER_CONE + 1, this.voronoi.numPoints);
	}
}
