/// NOTE: array returned has one extra point to finish off the cone in triangle fan format
export function generateCone(radius: number, numPoints: number): Float32Array {
	const points = new Float32Array((numPoints + 1) * 3);
	points[0] = 0;
	points[1] = 0;
	points[2] = -1;
	for (let i = 0; i < numPoints; i++) {
		const angle = i / (numPoints - 2) * 2 * Math.PI;
		points[3 * (i + 1)] = radius * Math.cos(angle);
		points[3 * (i + 1) + 1] = radius * Math.sin(angle);
		points[3 * (i + 1) + 2] = 0;
	}
	return points;
}
