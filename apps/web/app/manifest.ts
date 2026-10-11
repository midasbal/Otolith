import type { MetadataRoute } from "next";

/*
  The web app manifest: what a phone uses when the site is added to its
  home screen. The icons are the logo on its cream ground, made from the
  logo's own paths (see the README); the maskable one keeps the logo
  inside the safe zone a launcher may crop to.
*/
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Otolith",
    short_name: "Otolith",
    description: "Otolith is an on-chain, non-custodial portfolio auto-rebalancer for Stellar.",
    start_url: "/",
    display: "standalone",
    background_color: "#f1ebe6",
    theme_color: "#f1ebe6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
