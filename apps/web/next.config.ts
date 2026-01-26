import type { NextConfig } from 'next';

// 后端（Nest）地址：端口改为 4000
const API_TARGET =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_UPSTREAM ||
  process.env.API_URL ||
  "http://api:4000";

const nextConfig: NextConfig = {
  // 关键修复：开启 Standalone 模式
  output: 'standalone',
  async rewrites() {
    return [
      {
        // 前端访问 /api/v1/... 时代理到后端
        source: '/api/v1/:path*',
        destination: `${API_TARGET}/api/v1/:path*`,
      },
      // 前端访问 /uploads/... (图片) 时也代理到后端
      {
        source: '/uploads/:path*',
        destination: `${API_TARGET}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
