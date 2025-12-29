// apps/api/src/app.bootstrap.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { cookieParser } from './common/middleware/cookie-parser';

const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  // ✅ 只保留一个：统一信封 + 统一序列化
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  app.useGlobalFilters(new ApiExceptionFilter());
}

export function getApiPrefix(): string {
  return API_PREFIX;
}
