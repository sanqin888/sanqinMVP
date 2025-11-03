// dev-proxy.js
const http = require('http');
const httpProxy = require('http-proxy');
const { URL } = require('url');

const proxy = httpProxy.createProxyServer({});
const FRONT = 'http://localhost:3000'; // Next.js
const API   = 'http://localhost:4000'; // NestJS (含全局前缀 /api/v1)

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  // Clover HCO Webhook（保持原始字节）
  if (url.pathname.startsWith('/api/v1/webhooks/clover-hco')) {
    proxy.web(req, res, { target: API, changeOrigin: true, preserveHeaderKeyCase: true });
    return;
  }

  // 其余 /api 走后端
  if (url.pathname.startsWith('/api')) {
    proxy.web(req, res, { target: API, changeOrigin: true, preserveHeaderKeyCase: true });
    return;
  }

  // 其他路径走前端（含 /thank-you）
  proxy.web(req, res, { target: FRONT, changeOrigin: true, preserveHeaderKeyCase: true });
}).listen(8080, () => console.log('Dev proxy on http://localhost:8080'));
