import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Raymond's Personal Website",
    short_name: "Ray's Website",
    description: "Welcome to my personal website!",
    start_url: "/",
    display: "standalone",
    background_color: "#2f8a86",
    theme_color: "#2f8a86",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
