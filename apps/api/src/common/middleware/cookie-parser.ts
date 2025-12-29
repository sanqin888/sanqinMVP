import type { Request, RequestHandler } from 'express';

type CookieParserOptions = {
  decode?(value: string): string;
};

const DEFAULT_DECODE = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const SPLIT_COOKIE = /; */;

type MutableRequest = Request & { cookies?: Record<string, string> };

const parseCookies = (
  header: string | undefined,
  decode: (value: string) => string,
): Record<string, string> => {
  if (!header) return {};

  return header
    .split(SPLIT_COOKIE)
    .reduce<Record<string, string>>((acc, part) => {
      const [rawKey, ...rawValue] = part.split('=');
      if (!rawKey) return acc;
      const key = decode(rawKey.trim());
      const value =
        rawValue.length > 0 ? decode(rawValue.join('=').trim()) : '';
      acc[key] = value;
      return acc;
    }, {});
};

export const cookieParser = (
  _secret?: string | string[],
  options?: CookieParserOptions,
): RequestHandler => {
  const decode = (value: string): string =>
    options?.decode ? options.decode(value) : DEFAULT_DECODE(value);
  return (req, _res, next) => {
    const request = req as MutableRequest;
    request.cookies = parseCookies(req.headers.cookie, decode);
    next();
  };
};
