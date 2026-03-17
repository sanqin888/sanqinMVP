/* apps/api/src/main.ts */
/* apps/api/src/main.ts */
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, getApiPrefix } from './app.bootstrap';

import cookieParser from 'cookie-parser';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsRootDir } from './common/utils/uploads-path';

async function bootstrap(): Promise<void> {
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : null;

  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    console.error('\n❌ FATAL ERROR: CORS_ORIGIN is not defined in .env file.');
    console.error(
      '   Application cannot start in production without a strict CORS allowlist.\n',
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    cors: {
      origin: corsOrigin ?? 'http://localhost:3000',
      credentials: true,
    },
  });
  app.set('trust proxy', true);

  const prefix = getApiPrefix();

  // 先注册所有需要 raw body 的 webhook 路由
  app.use(`/${prefix}/webhooks/sendgrid-email`, express.raw({ type: '*/*' }));
  app.use(`/${prefix}/webhooks/twilio`, express.raw({ type: '*/*' }));
  app.use(`/${prefix}/webhooks/aws-sns`, express.raw({ type: '*/*' }));

  // Uber Eats webhook 必须保留原始 body，供 HMAC 验签
  app.use(
    `/${prefix}/integrations/ubereats/webhook`,
    express.raw({ type: '*/*' }),
  );

  // 其余路由正常走 JSON / form 解析
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  configureApp(app);

  const cookieSecret = process.env.COOKIE_SIGNING_SECRET;

  if (!cookieSecret && process.env.NODE_ENV === 'production') {
    console.error(
      '\n❌ FATAL ERROR: COOKIE_SIGNING_SECRET is not defined in .env file.',
    );
    console.error(
      '   Application cannot start in production without a secure cookie secret.\n',
    );
    process.exit(1);
  }

  app.use(cookieParser(cookieSecret || 'dev-fallback-secret-key'));

  const uploadsDir = getUploadsRootDir();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
  }

  const uploadAllowedExtensions = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
  ]);

  app.use(
    '/uploads',
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const extension = path.extname(req.path).toLowerCase();
      if (!uploadAllowedExtensions.has(extension)) {
        res.status(404).send('Not Found');
        return;
      }
      next();
    },
    express.static(uploadsDir, {
      setHeaders: (res: express.Response) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self' data:;",
        );
      },
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}/${prefix}`);

  if (!cookieSecret && process.env.NODE_ENV !== 'production') {
    console.warn(
      '⚠️  WARNING: Running with default dev cookie secret. Set COOKIE_SIGNING_SECRET in .env',
    );
  }
}

void bootstrap();
