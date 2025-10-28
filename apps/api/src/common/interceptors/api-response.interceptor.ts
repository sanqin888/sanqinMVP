import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
      map(
        (data): ApiEnvelope => ({
          code: 'OK',
          message: 'success',
          details: typeof data === 'undefined' ? null : data,
        }),
      ),
    );
  }
}
