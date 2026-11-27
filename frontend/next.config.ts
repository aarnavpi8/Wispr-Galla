import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see frontend/Dockerfile).
  output: "standalone",
  cacheComponents: true,
  // Dev only: let the Android emulator (10.0.2.2) and phones on your Wi-Fi load the dev
  // server. Add your laptop's LAN IP, e.g. $env:DEV_ORIGINS="192.168.1.20".
  allowedDevOrigins: ["10.0.2.2", ...(process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
