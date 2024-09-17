import { createTextureFramebufferBundle, initShaderProgram } from "./gl";
import ConeVertShaderSrc from "@/shaders/cone_vert.glsl";
import ConeFragShaderSrc from "@/shaders/cone_frag.glsl";
import EdgeFragShaderSrc from "@/shaders/edge_detection_frag.glsl";
import FullscreenVertShaderSrc from "@/shaders/fullscreen_quad_vert.glsl";
import BlurFragShaderSrc from "@/shaders/blur_frag.glsl";
import SharpenFragShaderSrc from "@/shaders/sharpen_frag.glsl";
import { generateCone } from "./shapes";
import { vec2 } from "gl-matrix";
import { MAX_POINTS, Voronoi } from "./voronoi";
import config from "@/scripts/config"

const CONE_RADIUS: number = 512;

type ConeInfo = {
	aIndex: GLint,
	aShapePosition: GLint,
	aPosition: GLint,
	aColor: GLint,
	uResolution: WebGLUniformLocation | null,
	uNumPoints: WebGLUniformLocation | null,
	uUseColor: WebGLUniformLocation | null,
	shapeBuffer: WebGLBuffer | null,
	positionBuffer: WebGLBuffer | null,
	indexBuffer: WebGLBuffer | null,
	colorBuffer: WebGLBuffer | null,
}

type EdgeInfo = {
	aPosition: GLint,
	uResolution: WebGLUniformLocation | null,
	uNumPoints: WebGLUniformLocation | null,
	uOutlineRadius: WebGLUniformLocation | null,
}

type BlurInfo = {
	aPosition: GLint,
	uResolution: WebGLUniformLocation | null,
	uBlurLine: WebGLUniformLocation | null,
	uBlurRadius: WebGLUniformLocation | null,
	uBlurSamples: WebGLUniformLocation | null,
}

type SharpenInfo = {
	aPosition: GLint,
	uAntialiasStrength: WebGLUniformLocation | null,
	uOutlineColor: WebGLUniformLocation | null,
	uTexture: WebGLUniformLocation | null,
	uCellColors: WebGLUniformLocation | null,
}

export class VoronoiRenderer {
	gl: WebGL2RenderingContext;
	voronoi: Voronoi;
	resolution: vec2;

	coneVAO: WebGLVertexArrayObject;
	coneProgram: WebGLProgram;
	cone: ConeInfo;

	postVAO: WebGLVertexArrayObject;
	edgeProgram: WebGLProgram;
	edge: EdgeInfo;
	blurProgram: WebGLProgram;
	blur: BlurInfo;
	sharpenProgram: WebGLProgram;
	sharpen: SharpenInfo;

	textures: WebGLTexture[];
	framebuffers: WebGLFramebuffer[];

	constructor(gl: WebGL2RenderingContext, numPoints: number, resolution: vec2) {
		this.gl = gl;
		this.voronoi = new Voronoi(numPoints, resolution, config.cellColors, config.accentColor);
		this.resolution = resolution;

		const coneProgram = initShaderProgram(gl, ConeVertShaderSrc, ConeFragShaderSrc);
		if (coneProgram == null) throw new Error("Failed to init cone program.");
		this.coneProgram = coneProgram;
		const coneVAO = gl.createVertexArray();
		if (coneVAO == null) throw new Error("Failed to init cone VAO");
		this.coneVAO = coneVAO;

		gl.useProgram(this.coneProgram);
		gl.enable(gl.DEPTH_TEST);
		gl.bindVertexArray(this.coneVAO);

		this.cone = {
			aShapePosition: gl.getAttribLocation(this.coneProgram, 'aShapePosition'),
			aPosition: gl.getAttribLocation(this.coneProgram, 'aPosition'),
			aIndex: gl.getAttribLocation(this.coneProgram, 'aIndex'),
			aColor: gl.getAttribLocation(this.coneProgram, 'aColor'),
			uResolution: gl.getUniformLocation(this.coneProgram, 'uResolution'),
			uNumPoints: gl.getUniformLocation(this.coneProgram, 'uNumPoints'),
			uUseColor: gl.getUniformLocation(this.coneProgram, 'uUseColor'),
			shapeBuffer: gl.createBuffer(),
			indexBuffer: gl.createBuffer(),
			positionBuffer: gl.createBuffer(),
			colorBuffer: gl.createBuffer(),
		};

		// initialize the vertices of the cone
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cone.shapeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, generateCone(CONE_RADIUS, config.pointsPerCone), gl.STATIC_DRAW);
		// set up attribute array for vertex positions for cone
		gl.enableVertexAttribArray(this.cone.aShapePosition);
		gl.vertexAttribPointer(this.cone.aShapePosition, 3, gl.FLOAT, false, 0, 0);

		// Initialize position instance array
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cone.positionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.voronoi.positions, gl.DYNAMIC_DRAW);
		gl.enableVertexAttribArray(this.cone.aPosition);
		gl.vertexAttribPointer(this.cone.aPosition, 2, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(this.cone.aPosition, 1);

		// Initialize index instance array
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cone.indexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.voronoi.ids, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.cone.aIndex);
		gl.vertexAttribPointer(this.cone.aIndex, 1, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(this.cone.aIndex, 1);

		// init color instance array
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cone.colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.voronoi.colors, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(this.cone.aColor);
		gl.vertexAttribPointer(this.cone.aColor, 3, gl.FLOAT, false, 0, 0);
		gl.vertexAttribDivisor(this.cone.aColor, 1);

		// Initialize num points uniform
		gl.uniform1f(this.cone.uNumPoints, this.voronoi.numPoints);

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

		this.edge = {
			aPosition: gl.getAttribLocation(this.edgeProgram, 'aPosition'),
			uResolution: gl.getUniformLocation(this.edgeProgram, 'uResolution'),
			uNumPoints: gl.getUniformLocation(this.edgeProgram, 'uNumPoints'),
			uOutlineRadius: gl.getUniformLocation(this.edgeProgram, 'uOutlineRadius'),
		};

		gl.useProgram(edgeProgram);
		gl.enable(gl.DEPTH_TEST);
		gl.enableVertexAttribArray(this.edge.aPosition);
		gl.vertexAttribPointer(this.edge.aPosition, 2, gl.FLOAT, false, 0, 0);

		gl.uniform1f(this.edge.uNumPoints, this.voronoi.numPoints);
		gl.uniform1f(this.edge.uOutlineRadius, config.outlineRadius);

		// blur
		const blurProgram = initShaderProgram(gl, FullscreenVertShaderSrc, BlurFragShaderSrc);
		if (blurProgram == null) throw new Error("Could not init blur program");
		this.blurProgram = blurProgram;

		this.blur = {
			aPosition: gl.getAttribLocation(this.blurProgram, 'aPosition'),
			uResolution: gl.getUniformLocation(this.blurProgram, 'uResolution'),
			uBlurLine: gl.getUniformLocation(this.blurProgram, 'uBlurLine'),
			uBlurRadius: gl.getUniformLocation(this.blurProgram, 'uBlurRadius'),
			uBlurSamples: gl.getUniformLocation(this.blurProgram, 'uBlurSamples'),
		};

		gl.useProgram(blurProgram);
		gl.enableVertexAttribArray(this.blur.aPosition);
		gl.vertexAttribPointer(this.blur.aPosition, 2, gl.FLOAT, false, 0, 0);

		gl.uniform1f(this.blur.uBlurRadius, config.blurRadius);
		gl.uniform1f(this.blur.uBlurSamples, config.blurSamples);

		// sharpen
		const sharpenProgram = initShaderProgram(gl, FullscreenVertShaderSrc, SharpenFragShaderSrc);
		if (sharpenProgram == null) throw new Error("Could not init sharpen program");
		this.sharpenProgram = sharpenProgram;

		this.sharpen = {
			aPosition: gl.getAttribLocation(this.sharpenProgram, 'aPosition'),
			uOutlineColor: gl.getUniformLocation(this.sharpenProgram, 'uOutlineColor'),
			uAntialiasStrength: gl.getUniformLocation(this.sharpenProgram, 'uAntialiasStrength'),
			uTexture: gl.getUniformLocation(this.sharpenProgram, 'uTexture'),
			uCellColors: gl.getUniformLocation(this.sharpenProgram, 'uCellColors'),
		}

		gl.useProgram(sharpenProgram);
		gl.enableVertexAttribArray(this.sharpen.aPosition);
		gl.vertexAttribPointer(this.sharpen.aPosition, 2, gl.FLOAT, false, 0, 0);

		gl.uniform1f(this.sharpen.uAntialiasStrength, config.antialiasStrength);
		gl.uniform3f(this.sharpen.uOutlineColor, config.outlineColor[0] / 256, config.outlineColor[1] / 256, config.outlineColor[2] / 256);

		// NOTE: create the 3 textures and framebuffers
		const textures = [];
		const framebuffers = [];
		for (let i = 0; i < 3; i++) {
			const data = createTextureFramebufferBundle(gl, resolution);
			textures.push(data[0]);
			framebuffers.push(data[1]);
		}
		this.textures = textures;
		this.framebuffers = framebuffers;
	}

	render(deltaTime: number, mousePos: vec2) {
		const gl = this.gl;

		// update voronoi points and upload point locations to cone shader
		this.voronoi.simulate(deltaTime, this.resolution, mousePos);

		let renderCount = 0;
		gl.useProgram(this.coneProgram);
		//reset active texture to 0 after last use
		gl.activeTexture(gl.TEXTURE0);
		gl.bindVertexArray(this.coneVAO);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.cone.positionBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.voronoi.positions, 0, this.voronoi.numPoints * 2);

		// draw into framebuffer 0
		gl.uniform1f(this.cone.uUseColor, 0.0); // dont use color for edge detection render
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[renderCount % 2]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, config.pointsPerCone + 1, this.voronoi.numPoints);
		renderCount++;

		// copy into texture 3 for use later (actual colors)
		gl.uniform1f(this.cone.uUseColor, 1.0); // use color for actual render
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[2]);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, config.pointsPerCone + 1, this.voronoi.numPoints); // +1 for mouse point
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
		for (let i = 0; i < config.blurDirections; i++) {
			const angle = i / config.blurDirections * Math.PI;
			const lineX = Math.cos(angle);
			const lineY = Math.sin(angle);

			gl.uniform2f(this.blur.uBlurLine, lineX, lineY);
			gl.bindTexture(gl.TEXTURE_2D, this.textures[(renderCount + 1) % 2]);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[renderCount % 2]);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			renderCount++;
		}

		// sharpen and merge
		gl.useProgram(this.sharpenProgram);

		gl.uniform1i(this.sharpen.uTexture, 0);
		gl.uniform1i(this.sharpen.uCellColors, 1);

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

		const newPoints = Math.min(size[0] * size[1] / config.pixelsPerPoint, MAX_POINTS - 1);
		this.voronoi.initPoints(newPoints, size);
		gl.useProgram(this.coneProgram);
		gl.uniform1f(this.cone.uNumPoints, this.voronoi.numPoints);
		gl.useProgram(this.edgeProgram);
		gl.uniform1f(this.edge.uNumPoints, this.voronoi.numPoints);

		gl.useProgram(this.coneProgram);
		gl.uniform2f(this.cone.uResolution, size[0], size[1]);
		gl.useProgram(this.edgeProgram);
		gl.uniform2f(this.edge.uResolution, size[0], size[1]);
		gl.useProgram(this.blurProgram);
		gl.uniform2f(this.blur.uResolution, size[0], size[1]);

		const textures = [];
		const framebuffers = [];
		for (let i = 0; i < 3; i++) {
			const data = createTextureFramebufferBundle(gl, size);
			textures.push(data[0]);
			framebuffers.push(data[1]);
		}
		this.textures = textures;
		this.framebuffers = framebuffers;

		gl.useProgram(curProgram);
	}
}
