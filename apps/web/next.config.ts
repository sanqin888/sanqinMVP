import type { NextConfig } from "next";

// Server-only Nest upstream. Browser JSON API calls go through the App Router BFF.
const API_UPSTREAM = process.env.API_UPSTREAM || "http://api:4000";
const CI_EXTERNAL_STATIC_CHECKS =
  process.env.SANQ_CI_EXTERNAL_STATIC_CHECKS === "1";

const nextConfig: NextConfig = {
  // CI runs dedicated lint and strict TypeScript gates before/after the build.
  // Normal local/production builds keep Next.js' built-in checks enabled.
  eslint: {
    ignoreDuringBuilds: CI_EXTERNAL_STATIC_CHECKS,
  },
  typescript: {
    ignoreBuildErrors: CI_EXTERNAL_STATIC_CHECKS,
  },
  // 关键修复：开启 Standalone 模式
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
  output: "standalone",
  async rewrites() {
    return [
      // Binary/static uploads remain a dedicated raw transport.
      {
        source: "/uploads/:path*",
        destination: `${API_UPSTREAM}/uploads/:path*`,
      },
    ];
  },
};

// SanQ's current PWA contract is manifest + standalone launch only.
// Do not add a service worker or runtime cache here without a separately
// reviewed PWA-runtime design. Orders, payments, Staff/POS authority and other
// dynamic business data remain network-authoritative.
export default nextConfig;
