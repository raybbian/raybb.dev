// Raw text via the Turbopack `raw` rule in next.config.ts.
declare module "*.glsl" {
  const src: string;
  export default src;
}
