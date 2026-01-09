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

  app.use(cookieParser(process.env.COOKIE_SECRET || 'super-secret-key'));

  const prefix = getApiPrefix();
  app.use(`/${prefix}/webhooks/clover-hco`, express.raw({ type: '*/*' }));

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created uploads directory at: ${uploadsDir}`);
  }
  app.use('/uploads', express.static(uploadsDir));

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}/${prefix}`);
}

void bootstrap();
