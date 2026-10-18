import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "R-Worktime",
    short_name: "Worktime",
    description: "Arbeitszeit, Überstunden und Stundenzettel aus Timing.",
    lang: "de",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8f9fb",
    theme_color: "#f8f9fb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
