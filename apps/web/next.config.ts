import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

// Server-only Nest upstream. Browser JSON API calls go through the App Router BFF.
const API_UPSTREAM = process.env.API_UPSTREAM || "http://api:4000";

const nextConfig: NextConfig = {
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

type PwaFactory = (config: {
  dest: string;
  register: boolean;
  skipWaiting: boolean;
  disable: boolean;
}) => (cfg: NextConfig) => NextConfig;

const packageJsonPath = path.join(process.cwd(), "package.json");
const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
const packageJson = JSON.parse(packageJsonRaw) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const hasNextPwa =
  Boolean(packageJson.dependencies?.["next-pwa"]) ||
  Boolean(packageJson.devDependencies?.["next-pwa"]);

if (!hasNextPwa) {
  console.warn("[web] next-pwa is not declared; PWA plugin is skipped.");
}

const require = createRequire(import.meta.url);
const withPWA = hasNextPwa
  ? (require("next-pwa") as PwaFactory)({
      dest: "public",
      register: true,
      skipWaiting: true,
      disable: process.env.NODE_ENV === "development",
    })
  : (cfg: NextConfig) => cfg;

export default withPWA(nextConfig);
