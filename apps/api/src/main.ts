/* apps/api/src/main.ts */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, getApiPrefix } from './app.bootstrap';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',')
        : 'http://localhost:3000',
      credentials: true,
    },
  });

  configureApp(app);

  // 🔐 安全配置：Cookie 签名
  // 1. 获取环境变量中的签名密钥
  const cookieSecret = process.env.COOKIE_SIGNING_SECRET;

  // 2. 生产环境强制检查：必须配置密钥，否则禁止启动
  if (!cookieSecret && process.env.NODE_ENV === 'production') {
    console.error(
      '\n❌ FATAL ERROR: COOKIE_SIGNING_SECRET is not defined in .env file.',
    );
    console.error(
      '   Application cannot start in production without a secure cookie secret.\n',
    );
    process.exit(1);
  }

  // 3. 启用 cookie-parser (开发环境如果没有配置，使用后备密钥)
  app.use(cookieParser(cookieSecret || 'dev-fallback-secret-key'));

  const prefix = getApiPrefix();

  // 处理 Clover Webhooks (需要 raw body 计算签名)
  app.use(`/${prefix}/webhooks/clover-hco`, express.raw({ type: '*/*' }));

  // 处理图片上传目录
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
  }
  app.use('/uploads', express.static(uploadsDir));

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
