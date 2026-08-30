import { NextRequest, NextResponse } from 'next/server';
import { buildApiUpstreamUrl } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
  'accept-encoding',
]);

function shouldEnableEdgeCache(req: NextRequest, path: string[]): boolean {
  if (!['GET', 'HEAD'].includes(req.method)) return false;
  const normalizedPath = path.join('/').toLowerCase();
  return (
    normalizedPath === 'v1/menu/public' ||
    normalizedPath.startsWith('v1/menu/public/')
  );
}

function buildUpstreamUrl(req: NextRequest, parts: string[]): URL | null {
  const url = buildApiUpstreamUrl(`/api/${parts.join('/')}`);
  if (!url) return null;
  req.nextUrl.searchParams.forEach((value, key) =>
    url.searchParams.append(key, value),
  );
  return url;
}

type ParamsPromise = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: ParamsPromise) {
  const { path } = await ctx.params;
  const upstreamUrl = buildUpstreamUrl(req, path);
  if (!upstreamUrl) {
    return NextResponse.json(
      {
        code: 'WEB_BFF_CONFIG_ERROR',
        message: 'API upstream is not configured',
        details: null,
      },
      { status: 500 },
    );
  }

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await req.arrayBuffer(),
    cache: 'no-store',
    redirect: 'manual',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    console.error('[api-proxy] upstream timeout:', upstreamUrl.toString());
  }, 25000);

  let res: Response;
  try {
    res = await fetch(upstreamUrl, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        code: 'WEB_BFF_UPSTREAM_ERROR',
        message: 'Upstream fetch failed',
        details: { detail: message },
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const resHeaders = new Headers();
  const headersWithCookies = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof headersWithCookies.getSetCookie === 'function'
      ? headersWithCookies.getSetCookie()
      : [];
  for (const cookie of setCookies) resHeaders.append('set-cookie', cookie);

  res.headers.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP.has(normalizedKey) || normalizedKey === 'set-cookie') return;
    resHeaders.set(key, value);
  });

  if (shouldEnableEdgeCache(req, path)) {
    resHeaders.set(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=60',
    );
  }

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
export async function PUT(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
export async function OPTIONS(req: NextRequest, ctx: ParamsPromise) {
  return proxy(req, ctx);
}
