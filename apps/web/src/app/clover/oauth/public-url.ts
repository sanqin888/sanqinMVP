const DEFAULT_PUBLIC_ORIGIN = 'https://sanq.ca';

export const cloverOAuthPublicOrigin = (): string => {
  const configured = process.env.PUBLIC_BASE_URL?.trim() || DEFAULT_PUBLIC_ORIGIN;
  try {
    return new URL(configured).origin;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
};

export const cloverOAuthResultUrl = (reason?: string): URL => {
  const url = new URL('/clover/oauth/result', cloverOAuthPublicOrigin());
  if (reason) {
    url.searchParams.set('status', 'failure');
    url.searchParams.set('reason', reason);
  }
  return url;
};
