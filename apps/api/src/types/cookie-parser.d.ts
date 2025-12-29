declare module 'cookie-parser' {
  import type { RequestHandler } from 'express';

  type CookieParserFactory = (
    secret?: string | string[],
    options?: { decode?(val: string): string },
  ) => RequestHandler;

  const cookieParser: CookieParserFactory;
  export default cookieParser;
}
