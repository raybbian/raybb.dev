// `*.glsl` files are imported as raw text via the Turbopack `raw` rule
// configured in next.config.ts.
declare module "*.glsl" {
  const src: string;
  export default src;
}
