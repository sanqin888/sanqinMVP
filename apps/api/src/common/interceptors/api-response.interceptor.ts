// apps/api/src/common/interceptors/api-response.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { convertBigIntToString } from './bigint-to-string.interceptor';

type ApiEnvelope = {
  code: string;
  message: string;
  details: unknown;
};

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    return next.handle().pipe(
      map((data: unknown): ApiEnvelope => {
        const normalized = convertBigIntToString(
          typeof data === 'undefined' ? null : data,
        );
        return {
          code: 'OK',
          message: 'success',
          details: normalized,
        };
      }),
    );
  }
}
