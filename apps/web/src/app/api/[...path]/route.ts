// apps/web/src/app/api/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 必填：前端 .env.local 里设置 API_UPSTREAM=https://<你的-ngrok-域名>
// 例如：https://axonometric-frances-tawdrily.ngrok-free.dev
const UPSTREAM = (process.env.API_UPSTREAM ?? '').replace(/\/$/, '');
if (!UPSTREAM) {
  // 在开发时也要给出清楚的错误，避免“没反应”
  console.error('[api-proxy] Missing API_UPSTREAM in .env.local');
}

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
  'content-length', 'host', 'accept-encoding',
]);

function buildUpstreamUrl(req: NextRequest, parts: string[]) {
  // 你的后端有全局 /api/v1 前缀
  const base = `${UPSTREAM}/api`;
  const url = new URL(`${base}/${parts.join('/')}`);
  // 透传查询
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.append(k, v));
  // 附加 ngrok 跳过参数（对本地无副作用）
  url.searchParams.set('ngrok-skip-browser-warning', 'true');
  return url;
}

type ParamsPromise = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: ParamsPromise) {
  const { path } = await ctx.params; // Next 15: params 是 Promise
  if (!UPSTREAM) {
    return NextResponse.json({ ok: false, reason: 'Missing API_UPSTREAM' }, { status: 500 });
  }

  const upstreamUrl = buildUpstreamUrl(req, path);

  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v); });
  headers.set('ngrok-skip-browser-warning', 'true');
  // 明确 JSON 首选
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(),
    cache: 'no-store',
    redirect: 'manual',
  };

  // 25s 超时，避免“无响应”
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    console.error('[api-proxy] upstream timeout:', upstreamUrl.toString());
  }, 25000);

  let res: Response;
  try {
    res = await fetch(upstreamUrl, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, reason: 'Upstream fetch failed', detail: message },
      { status: 502 },
    );
  }
  clearTimeout(timeout);

const resHeaders = new Headers();

// ✅ 1) set-cookie 需要 append（可能多条）
const anyHeaders = res.headers as any;
const setCookies: string[] =
  typeof anyHeaders.getSetCookie === 'function' ? anyHeaders.getSetCookie() : [];
for (const c of setCookies) resHeaders.append('set-cookie', c);

// ✅ 2) 其他 header 正常透传（跳过 set-cookie，避免覆盖）
res.headers.forEach((v, k) => {
  const key = k.toLowerCase();
  if (HOP_BY_HOP.has(key)) return;
  if (key === 'set-cookie') return;
  resHeaders.set(k, v);
});

return new NextResponse(res.body, {
  status: res.status,
  statusText: res.statusText,
  headers: resHeaders,
});

// 兼容所有方法
export async function GET(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
export async function POST(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
export async function PATCH(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
export async function PUT(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
export async function DELETE(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
export async function HEAD(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
export async function OPTIONS(req: NextRequest, ctx: ParamsPromise) { return proxy(req, ctx); }
