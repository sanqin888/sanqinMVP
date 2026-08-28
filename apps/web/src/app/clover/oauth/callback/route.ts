import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ALLOWED_QUERY_KEYS = [
  'code',
  'state',
  'merchant_id',
  'merchantId',
  'client_id',
  'clientId',
  'error',
] as const;

export function GET(request: NextRequest): NextResponse {
  const target = new URL('/api/v1/payments/clover/oauth/callback', request.url);
  for (const key of ALLOWED_QUERY_KEYS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target, 302);
}
