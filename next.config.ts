import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Product images come from whatever hosts the database points at, so we render
  // them with plain <img> instead of next/image (which needs an allowlist).
};

export default nextConfig;
