// Minimal local Turbopack/webpack loader: emit a .glsl file's contents as a
// default-exported string, after resolving `#include "file.glsl"` directives
// at build time. Includes are resolved relative to the including file, applied
// recursively, and de-duplicated per resolve so a chunk pulled in twice is
// inlined once. Each included file is registered via addDependency so editing
// a shared chunk rebuilds every shader that includes it. Kept in-repo to avoid
// a third-party raw-loader dep.
const fs = require("fs");
const path = require("path");

const INCLUDE = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*$/gm;

function inline(src, fromDir, addDependency, seen) {
  return src.replace(INCLUDE, (_, rel) => {
    const abs = path.resolve(fromDir, rel);
    if (seen.has(abs)) return ""; // already inlined in this resolve
    seen.add(abs);
    addDependency(abs);
    const text = fs.readFileSync(abs, "utf8");
    return inline(text, path.dirname(abs), addDependency, seen);
  });
}

module.exports = function glslLoader(source) {
  const addDependency =
    typeof this.addDependency === "function"
      ? this.addDependency.bind(this)
      : () => {};
  const resolved = inline(
    source,
    path.dirname(this.resourcePath),
    addDependency,
    new Set(),
  );
  return `const src = ${JSON.stringify(resolved)};\nexport default src;`;
};
