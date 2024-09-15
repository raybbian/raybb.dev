import { createTextureAndFramebuffer, initShaderProgram, setupTexture } from "./gl";
import ConeVertShaderSrc from "@/shaders/cone_vert.glsl";
import ConeFragShaderSrc from "@/shaders/cone_frag.glsl";
import EdgeFragShaderSrc from "@/shaders/edge_detection_frag.glsl";
import FullscreenVertShaderSrc from "@/shaders/fullscreen_quad_vert.glsl";
import BlurFragShaderSrc from "@/shaders/blur_frag.glsl";
import SharpenFragShaderSrc from "@/shaders/sharpen_frag.glsl";
import { generateCone } from "./shapes";
import { vec2 } from "gl-matrix";
import { Voronoi } from "./voronoi";

/// Note: we must add 1 to all occurrences of this because the triangle fan needs one more point to close off the loop
const POINTS_PER_CONE: number = 129;
const CONE_RADIUS: number = 500;
const BLUR_DIRECTIONS: number = 4;

export class VoronoiRenderer {
	gl: WebGL2RenderingContext;
	voronoi: Voronoi;
	curTime: number = 0;
	resolution: vec2;

	// NOTE: Cone program
	coneProgram: WebGLProgram;
	coneVAO: WebGLVertexArrayObject;
	conePositionBuffer: WebGLBuffer;

	// NOTE: Post processing
	postVAO: WebGLVertexArrayObject;
	edgeProgram: WebGLProgram;
	blurProgram: WebGLProgram;
	sharpenProgram: WebGLProgram;

	textures: WebGLTexture[];
	framebuffers: WebGLFramebuffer[];

	constructor(gl: WebGL2RenderingContext, numPoints: number, resolution: vec2) {
		this.gl = gl;
		this.voronoi = new Voronoi(numPoints, resolution, [[24, 24, 37], [30, 30, 46], [49, 50, 68]]);
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
		gl.bufferData(gl.ARRAY_BUFFER, this.voronoi.ids, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(indexLocation);
		gl.vertexAttribPointer(indexLocation, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(indexLocation, 1);

		// init color instance array
		const colorLocation = gl.getAttribLocation(this.coneProgram, 'aColor');
		const colorBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.voronoi.colors, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(colorLocation);
		gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(colorLocation, 1);

		// Initialize num points uniform
		const numPointsUniform = gl.getUniformLocation(this.coneProgram, 'uNumPoints');
		gl.uniform1f(numPointsUniform, this.voronoi.numPoints);

		// NOTE: initialize post programs
		const postVAO = gl.createVertexArray();
		if (postVAO == null) throw new Error("Failed to initialize edge vertex array");
		this.postVAO = postVAO;
		gl.bindVertexArray(postVAO);

		const fullscreenBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0]), gl.STATIC_DRAW);

		// edge
		const edgeProgram = initShaderProgram(gl, FullscreenVertShaderSrc, EdgeFragShaderSrc);
		if (edgeProgram == null) throw new Error("Failed to initialize edge detection program");
		this.edgeProgram = edgeProgram;

		gl.useProgram(edgeProgram);
		gl.enable(gl.DEPTH_TEST);
		let fullscreenLocation = gl.getAttribLocation(edgeProgram, 'aPosition');
		gl.enableVertexAttribArray(fullscreenLocation);
		gl.vertexAttribPointer(fullscreenLocation, 2, gl.FLOAT, false, 0, 0);

		// blur
		const blurProgram = initShaderProgram(gl, FullscreenVertShaderSrc, BlurFragShaderSrc);
		if (blurProgram == null) throw new Error("Could not init blur program");
		this.blurProgram = blurProgram;

		gl.useProgram(blurProgram);
		fullscreenLocation = gl.getAttribLocation(blurProgram, 'aPosition');
		gl.enableVertexAttribArray(fullscreenLocation);
		gl.vertexAttribPointer(fullscreenLocation, 2, gl.FLOAT, false, 0, 0);

		// sharpen
		const sharpenProgram = initShaderProgram(gl, FullscreenVertShaderSrc, SharpenFragShaderSrc);
		if (sharpenProgram == null) throw new Error("Could not init sharpen program");
		this.sharpenProgram = sharpenProgram;

		gl.useProgram(sharpenProgram);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		fullscreenLocation = gl.getAttribLocation(sharpenProgram, 'aPosition');
		gl.enableVertexAttribArray(fullscreenLocation);
		gl.vertexAttribPointer(fullscreenLocation, 2, gl.FLOAT, false, 0, 0);

		// NOTE: create the 3 textures and framebuffers
		const textures = [];
		const framebuffers = [];
		for (let i = 0; i < 3; i++) {
			const data = createTextureAndFramebuffer(gl, resolution);
			textures.push(data[0]);
			framebuffers.push(data[1]);
		}
		this.textures = textures;
		this.framebuffers = framebuffers;
	}

	render(time: number) {
		const gl = this.gl;
		time *= 0.001;
		const deltaTime = time - this.curTime;
		this.curTime = time;

		// update voronoi points and upload point locations to cone shader
		this.voronoi.simulate(deltaTime, this.resolution);

		let renderCount = 0;
		gl.useProgram(this.coneProgram);
		//reset active texture to 0 after last use
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(this.coneVAO);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.conePositionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.voronoi.positions);

		// draw into framebuffer 0
		const useColorLoc = gl.getUniformLocation(this.coneProgram, 'uUseColor');
		gl.uniform1f(useColorLoc, 0.0); // dont use color for edge detection render
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[renderCount % 2]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, POINTS_PER_CONE + 1, this.voronoi.numPoints);
		renderCount++;

		// copy into texture 3 for use later (actual colors)
		gl.uniform1f(useColorLoc, 1.0); // use color for actual render
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[2]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, POINTS_PER_CONE + 1, this.voronoi.numPoints);
		// dont add renderCount, this is not using first two textures

		// start post
		gl.bindVertexArray(this.postVAO);

		// edge
		gl.useProgram(this.edgeProgram);
		gl.bindTexture(gl.TEXTURE_2D, this.textures[(renderCount + 1) % 2]);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[renderCount % 2]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		renderCount++;

		//blur
		gl.useProgram(this.blurProgram);
		const blurLineUniform = gl.getUniformLocation(this.blurProgram, 'uBlurLine');
		for (let i = 0; i < BLUR_DIRECTIONS; i++) {
			const angle = i / BLUR_DIRECTIONS * Math.PI;
			const lineX = Math.cos(angle);
			const lineY = Math.sin(angle);

			gl.uniform2f(blurLineUniform, lineX, lineY);
			gl.bindTexture(gl.TEXTURE_2D, this.textures[(renderCount + 1) % 2]);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[renderCount % 2]);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			renderCount++;
		}

		// sharpen and merge
		gl.useProgram(this.sharpenProgram);

		const uTextureLoc = gl.getUniformLocation(this.sharpenProgram, 'uTexture');
		const uCellColorLoc = gl.getUniformLocation(this.sharpenProgram, 'uCellColors');
		gl.uniform1i(uTextureLoc, 0);
		gl.uniform1i(uCellColorLoc, 1);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.textures[(renderCount + 1) % 2]);
		// store cell colors in texture 1
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.textures[2]);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		renderCount++;
	}

	changeResolution(size: vec2) {
		this.resolution = size;
		const gl = this.gl;
		const curProgram = gl.getParameter(gl.CURRENT_PROGRAM);

		gl.viewport(0, 0, size[0], size[1]);

		[this.coneProgram, this.blurProgram, this.edgeProgram].forEach((program) => {
			gl.useProgram(program);
			const resolutionUniform = gl.getUniformLocation(program, 'uResolution');
			gl.uniform2f(resolutionUniform, size[0], size[1]);
		});

		const textures = [];
		const framebuffers = [];
		for (let i = 0; i < 3; i++) {
			const data = createTextureAndFramebuffer(gl, size);
			textures.push(data[0]);
			framebuffers.push(data[1]);
		}
		this.textures = textures;
		this.framebuffers = framebuffers;

		gl.useProgram(curProgram);
	}
}
