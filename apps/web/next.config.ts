import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

// 后端（Nest）地址：端口改为 4000
const API_TARGET =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_UPSTREAM ||
  process.env.API_URL ||
  "http://api:4000";

const nextConfig: NextConfig = {
  // 关键修复：开启 Standalone 模式
  output: "standalone",
  async rewrites() {
    return [
      {
        // 前端访问 /api/v1/... 时代理到后端
        source: "/api/v1/:path*",
        destination: `${API_TARGET}/api/v1/:path*`,
      },
      // 前端访问 /uploads/... (图片) 时也代理到后端
      {
        source: "/uploads/:path*",
        destination: `${API_TARGET}/uploads/:path*`,
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
