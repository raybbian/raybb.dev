/** @type {import('next').NextConfig} */
const nextConfig = {
  // reactStrictMode: true,
  webpack: (config, _) => {
    config.module.rules.push({
      test: /\.(glsl|vert|frag)$/,
      type: "asset/source",
    })
    return config
  },
};
export default nextConfig;
