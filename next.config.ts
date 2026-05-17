import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      // Import shader sources (*.glsl) verbatim as default-exported strings
      // via the in-repo loader (avoids a third-party raw-loader dependency).
      "*.glsl": {
        loaders: [path.resolve(process.cwd(), "glsl-loader.cjs")],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
