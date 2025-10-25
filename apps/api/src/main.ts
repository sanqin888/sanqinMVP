import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import type { INestApplication } from '@nestjs/common';

let appRef: INestApplication | null = null; // 防止重复 listen

async function bootstrap() {
  if (appRef) {
    // 已经在监听了，避免第二次调用造成 ERR_SERVER_ALREADY_LISTEN
    console.log('[API] already listening, skip second start');
    return;
  }

  const app = await NestFactory.create(AppModule);

  // 让请求对象携带 rawBody —— Clover HCO 的签名校验要用“原始报文”
  app.use(express.json({
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  app.use(express.urlencoded({
    extended: true,
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  appRef = app;
  console.log(`[API] listening on http://localhost:${port}`);
}
bootstrap();