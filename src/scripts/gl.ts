import { vec2 } from "gl-matrix";

function loadShader(gl: WebGL2RenderingContext, type: GLenum, source: string): WebGLShader | null {
	const shader = gl.createShader(type);
	if (shader == null) {
		console.error("Failed to create shader " + shader);
		return null;
	}
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

export function initShaderProgram(gl: WebGL2RenderingContext, vertexShaderSrc: string, fragmentShaderSrc: string): WebGLProgram | null {
	const vertShader = loadShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	const fragShader = loadShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	if (vertShader == null || fragShader == null) return null;

	const program = gl.createProgram();
	if (program == null) {
		console.error("Failed to create shader program");
		return null;
	}

	gl.attachShader(program, vertShader);
	gl.attachShader(program, fragShader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error("Unable to initialize the shader program" + gl.getProgramInfoLog(program));
		return null;
	}

	gl.deleteShader(vertShader);
	gl.deleteShader(fragShader);

	return program;
}

export function setupTexture(gl: WebGL2RenderingContext) {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);

	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	return texture;
}

export function createTextureFramebufferBundle(gl: WebGL2RenderingContext, resolution: vec2) {
	// initialize empty texture
	const texture = setupTexture(gl);
	if (texture == null) throw new Error("Failed to create textures");
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, resolution[0], resolution[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

	//initialize depth buffer
	const depthBuffer = gl.createRenderbuffer();
	gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, resolution[0], resolution[1]);

	// initialize framebuffer
	const fbo = gl.createFramebuffer();
	if (fbo == null) throw new Error("Cannot create framebuffer");
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

	return [texture, fbo];
}
