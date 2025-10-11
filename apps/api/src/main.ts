import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BigIntToStringInterceptor } from './common/interceptors/bigint-to-string.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.useGlobalInterceptors(new BigIntToStringInterceptor());
  await app.listen(4000);
}
void bootstrap(); // 显式忽略返回的 Promise，符合 no-floating-promises 规则
