import type { NextConfig } from "next";
import path from "node:path";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Allow .md/.mdx files to be pages and route segments.
  pageExtensions: ["ts", "tsx", "md", "mdx", "js", "jsx"],
  allowedDevOrigins: ["*.trycloudflare.com"],
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
  images: {
    remotePatterns: [new URL("https://cdn.discordapp.com/**")],
  },
};

const withMDX = createMDX({
  options: {
    // String names: Turbopack can't pass JS function plugins to Rust.
    remarkPlugins: ["remark-gfm", "remark-math"],
    rehypePlugins: [
      "@myriaddreamin/rehype-typst",
      path.resolve(process.cwd(), "rehype-strip-typst-namespaces.mjs"),
      "rehype-slug",
    ],
  },
});

export default withMDX(nextConfig);
