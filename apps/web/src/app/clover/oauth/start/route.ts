import { NextRequest, NextResponse } from 'next/server';

import { cloverOAuthResultUrl } from '../public-url';

export const dynamic = 'force-dynamic';

const ALLOWED_QUERY_KEYS = [
  'merchant_id',
  'merchantId',
  'mId',
  'client_id',
  'clientId',
] as const;

const oauthRedirect = (url: URL, status: number): NextResponse => {
  const response = NextResponse.redirect(url, status);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};

const failureRedirect = () =>
  oauthRedirect(cloverOAuthResultUrl('TEMPORARY_FAILURE'), 303);

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
      return failureRedirect();
    }
    return oauthRedirect(new URL(location), response.status);
  } catch {
    return failureRedirect();
  }
}
