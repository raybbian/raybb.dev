// 1D value noise, range [0, 1). C1-continuous so it drives headings/speeds
// without the jitter a per-frame random would add.

function hash(i: number): number {
  let n = (i | 0) * 374761393 + 668265263;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function noise1(x: number): number {
  const i = Math.floor(x);
  const t = x - i;
  const s = t * t * (3 - 2 * t); // smoothstep
  return hash(i) * (1 - s) + hash(i + 1) * s;
}
