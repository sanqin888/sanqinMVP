import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BigIntToStringInterceptor } from './common/interceptors/bigint-to-string.interceptor';
import type { INestApplication } from '@nestjs/common';

let appRef: INestApplication | null = null; // 防止重复 listen

async function bootstrap() {
  if (appRef) {
    // 已经在监听了，避免第二次调用造成 ERR_SERVER_ALREADY_LISTEN
    console.log('[API] already listening, skip second start');
    return;
  }

  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.useGlobalInterceptors(new BigIntToStringInterceptor());

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  appRef = app;
  console.log(`[API] listening on http://localhost:${port}`);
}
void bootstrap();
