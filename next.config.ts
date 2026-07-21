import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
    ],
  },
  // tesseract.js (T3 OCR) ships a WASM core + worker; let it load from
  // node_modules at runtime instead of being bundled by the server compiler.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
