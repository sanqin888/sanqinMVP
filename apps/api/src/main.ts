import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 统一使用 /api 前缀
  app.setGlobalPrefix('api');

  // CORS：把本机 3000 和你的局域网地址都放开
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.2.174:3000', // Next 日志里显示的 Network 地址
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`API ready at http://localhost:${port}/api`);
}
bootstrap();