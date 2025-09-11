import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api');
  await app.listen(4000);
}
void bootstrap(); // 显式忽略返回的 Promise，符合 no-floating-promises 规则
