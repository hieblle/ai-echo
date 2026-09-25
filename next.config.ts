import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker-ready build so the app is not tied to one host (DECISIONS D3.1).
  output: "standalone",
};

export default nextConfig;
