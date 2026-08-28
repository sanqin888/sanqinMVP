import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ALLOWED_QUERY_KEYS = [
  'merchant_id',
  'merchantId',
  'mId',
  'client_id',
  'clientId',
] as const;

const failureRedirect = (request: NextRequest) =>
  NextResponse.redirect(
    new URL(
      '/clover/oauth/result?status=failure&reason=TEMPORARY_FAILURE',
      request.url,
    ),
    303,
  );

export async function GET(request: NextRequest): Promise<NextResponse> {
  const upstream = process.env.API_UPSTREAM || 'http://localhost:4000';
  const target = new URL('/api/v1/payments/clover/oauth/start', upstream);
  for (const key of ALLOWED_QUERY_KEYS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  try {
    const response = await fetch(target, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
    });
    const location = response.headers.get('location');
    if (!location || response.status < 300 || response.status >= 400) {
      return failureRedirect(request);
    }
    return NextResponse.redirect(new URL(location, request.url), response.status);
  } catch {
    return failureRedirect(request);
  }
}
