import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  UberApplicationError,
  type UberErrorCategory,
} from '../application/shared/uber-application.error';
import { toUberPublicError } from '../contracts/responses/ubereats.responses';

const STATUS_BY_CATEGORY: Record<UberErrorCategory, number> = {
  authentication: HttpStatus.UNAUTHORIZED,
  validation: HttpStatus.BAD_REQUEST,
  'business-conflict': HttpStatus.CONFLICT,
  'rate-limited': HttpStatus.TOO_MANY_REQUESTS,
  'transient-upstream': HttpStatus.SERVICE_UNAVAILABLE,
  'non-retryable-upstream': HttpStatus.BAD_GATEWAY,
};

/** The sole HTTP presentation boundary for framework-free Uber errors. */
@Catch(UberApplicationError)
export class UberEatsExceptionFilter implements ExceptionFilter<UberApplicationError> {
  catch(error: UberApplicationError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const correlationId: string = this.correlationId(request);

    response.setHeader('X-Correlation-Id', correlationId);
    if (error.retryAfterMs !== null) {
      response.setHeader('Retry-After', Math.ceil(error.retryAfterMs / 1_000));
    }
    response
      .status(STATUS_BY_CATEGORY[error.category])
      .json(
        toUberPublicError(
          error.code,
          error.message,
          error.retryable,
          correlationId,
        ),
      );
  }

  private correlationId(request: Request): string {
    const supplied = request.headers['x-correlation-id'];
    return typeof supplied === 'string' &&
      /^[A-Za-z0-9._-]{1,128}$/.test(supplied)
      ? supplied
      : randomUUID();
  }
}
