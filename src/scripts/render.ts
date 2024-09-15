import { initShaderProgram, setupTexture } from "./gl";
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
const POINTS_PER_CONE: number = 65;
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

		// NOTE: create the two textures and framebuffers
		const data = this.createTexturesAndFramebuffers(gl, resolution);
		this.textures = data[0];
		this.framebuffers = data[1];
	}

	createTexturesAndFramebuffers(gl: WebGL2RenderingContext, resolution: vec2) {
		const textures = [];
		const framebuffers = [];
		for (let i = 0; i < 2; i++) {
			// initialize empty texture
			const texture = setupTexture(gl);
			if (texture == null) throw new Error("Failed to create textures");
			textures.push(texture);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, resolution[0], resolution[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

			//initialize depth buffer
			const depthBuffer = gl.createRenderbuffer();
			gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, resolution[0], resolution[1]);

			// initialize framebuffer
			const fbo = gl.createFramebuffer();
			if (fbo == null) throw new Error("Cannot create framebuffer");
			framebuffers.push(fbo);
			gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
			gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
		}
		return [textures, framebuffers];
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

		const data = this.createTexturesAndFramebuffers(gl, size);
		this.textures = data[0];
		this.framebuffers = data[1];

		gl.useProgram(curProgram);
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
		gl.bindVertexArray(this.coneVAO);

		const positionArray = new Float32Array(this.voronoi.numPoints * 2)
		for (let i = 0; i < this.voronoi.numPoints; i++) {
			positionArray[2 * i] = this.voronoi.points[i].pos[0];
			positionArray[2 * i + 1] = this.voronoi.points[i].pos[1];
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.conePositionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionArray);

		// draw into framebuffer 0
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[renderCount % 2]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, POINTS_PER_CONE + 1, this.voronoi.numPoints);
		renderCount++;

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

		gl.useProgram(this.sharpenProgram);
		gl.bindTexture(gl.TEXTURE_2D, this.textures[(renderCount + 1) % 2]);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		renderCount++;
	}
}
