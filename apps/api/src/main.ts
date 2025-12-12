/* apps/api/src/main.ts */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, getApiPrefix } from './app.bootstrap';
import * as express from 'express';
import * as path from 'path';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  configureApp(app);
  const prefix = getApiPrefix();
  app.setGlobalPrefix(getApiPrefix());

  app.use(`/${prefix}/webhooks/clover-hco`, express.raw({ type: '*/*' }));

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);

  console.log(`API listening on http://localhost:${port}/${getApiPrefix()}`);
}

// Use void to explicitly ignore the returned promise and satisfy eslint
void bootstrap();
