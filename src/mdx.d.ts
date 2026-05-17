// Augments @types/mdx so posts can export typed `metadata` alongside default.
declare module "*.mdx" {
  export const metadata: {
    title: string;
    date: string;
    description: string;
  };
}
