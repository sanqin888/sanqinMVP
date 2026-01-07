// apps/web/next.config.ts
import type { NextConfig } from 'next';

// 后端（Nest）地址：端口改为 4000
const API_TARGET =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // 前端访问 /api/v1/... 时代理到后端
        source: '/api/v1/:path*',
        destination: `${API_TARGET}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
