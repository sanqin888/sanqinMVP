import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SanQ Roujiamo",
    short_name: "SanQ",
    description: "SanQ Roujiamo online ordering experience.",
    start_url: "/zh",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/images/sanqinLOGO.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/images/sanqinLOGO.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
