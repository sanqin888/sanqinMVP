import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { BigIntToStringInterceptor } from './common/interceptors/bigint-to-string.interceptor';

export function configureApp(app: INestApplication): void {
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
  return 'api/v1';
}
