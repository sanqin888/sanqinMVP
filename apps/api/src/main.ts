/* apps/api/src/main.ts */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, getApiPrefix } from './app.bootstrap';

import cookieParser from 'cookie-parser';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap(): Promise<void> {
  // 1. 禁用 NestJS 默认的 bodyParser
  // 这样我们可以手动控制解析器的顺序，避免 Webhook 的 raw body 被提前消费
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

  const app = await NestFactory.create(AppModule, {
    bodyParser: false, //禁用默认
    cors: {
      origin: corsOrigin ?? 'http://localhost:3000',
      credentials: true,
    },
  });

  const prefix = getApiPrefix();

  // 2. 【第一步】特殊处理 Clover Webhooks
  // 使用 express.raw 只针对这个路径解析为 Buffer，方便验签
  // 注意：必须在 express.json() 之前注册
  app.use(`/${prefix}/webhooks/clover-hco`, express.raw({ type: '*/*' }));

  // 3. 【第二步】为其余所有路由启用 JSON 解析
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 4. 配置全局拦截器、过滤器等
  configureApp(app);

  // 5. 🔐 安全配置：Cookie 签名
  const cookieSecret = process.env.COOKIE_SIGNING_SECRET;

  // 生产环境强制检查：必须配置密钥，否则禁止启动
  if (!cookieSecret && process.env.NODE_ENV === 'production') {
    console.error(
      '\n❌ FATAL ERROR: COOKIE_SIGNING_SECRET is not defined in .env file.',
    );
    console.error(
      '   Application cannot start in production without a secure cookie secret.\n',
    );
    process.exit(1);
  }

  // 启用 cookie-parser
  app.use(cookieParser(cookieSecret || 'dev-fallback-secret-key'));

  // 6. 处理图片上传目录
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
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

  // 7. 启动监听
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
