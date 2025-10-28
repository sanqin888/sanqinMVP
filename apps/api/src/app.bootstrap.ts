import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { BigIntToStringInterceptor } from './common/interceptors/bigint-to-string.interceptor';

const API_PREFIX = 'api/v1';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  app.useGlobalInterceptors(
    new BigIntToStringInterceptor(),
    new ApiResponseInterceptor(),
  );

  app.useGlobalFilters(new ApiExceptionFilter());
}

export function getApiPrefix(): string {
  return API_PREFIX;
}
