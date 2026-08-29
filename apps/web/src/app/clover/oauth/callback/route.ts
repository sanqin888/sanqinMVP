import { NextRequest, NextResponse } from 'next/server';

import { cloverOAuthPublicOrigin, cloverOAuthResultUrl } from '../public-url';

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

const redirectWithoutReferrer = (url: URL) => {
  const response = NextResponse.redirect(url, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
};

const failureRedirect = () =>
  redirectWithoutReferrer(cloverOAuthResultUrl('TEMPORARY_FAILURE'));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const upstream = process.env.API_UPSTREAM || 'http://localhost:4000';
  const target = new URL('/api/v1/payments/clover/oauth/callback', upstream);
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

    const publicOrigin = cloverOAuthPublicOrigin();
    const result = new URL(location, publicOrigin);
    if (
      result.origin !== publicOrigin ||
      result.pathname !== '/clover/oauth/result'
    ) {
      return failureRedirect();
    }
    return redirectWithoutReferrer(result);
  } catch {
    return failureRedirect();
  }
}
