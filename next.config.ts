import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker-ready build so the app is not tied to one host (DECISIONS D3.1).
  output: "standalone",
  experimental: {
    // Copilot usage reports are uploaded as CSV through a server action
    // (one line per licensed user; a few MB for large tenants — D4.10).
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
