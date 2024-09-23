import { vec3 } from "gl-matrix";

export type VoronoiConfig = {
	pixelsPerPoint: number,
	outlineColor: vec3,
	cellColors: vec3[],
	pointsPerCone: number,
	outlineRadius: number,
	blurDirections: number,
	blurRadius: number,
	blurSamples: number,
	antialiasStrength: number,
}

const config: VoronoiConfig = {
	pixelsPerPoint: 15000,
	outlineColor: [17, 17, 27],
	cellColors: [[24, 24, 37], [27, 27, 42], [30, 30, 46]],
	pointsPerCone: 65,
	outlineRadius: 1,
	blurDirections: 4,
	blurRadius: 6,
	blurSamples: 20,
	antialiasStrength: .2,
}

export default config;
