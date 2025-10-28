import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

type ErrorEnvelope = {
  code: string;
  message: string;
  details: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    const { status, body } = this.normalizeException(exception);
    res.status(status).json(body);
  }

  private normalizeException(exception: unknown): {
    status: number;
    body: ErrorEnvelope;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = this.extractMessage(exception.message, response);
      const details = this.extractDetails(response);
      const code = this.extractCode(response, status);

      return {
        status,
        body: { code, message, details },
      };
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    const details =
      process.env.NODE_ENV === 'production'
        ? null
        : exception instanceof Error
          ? { stack: exception.stack }
          : { received: exception };

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
        details,
      },
    };
  }

  private extractMessage(defaultMessage: string, response: unknown): string {
    if (typeof response === 'string') return response;
    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      typeof (response as Record<string, unknown>).message !== 'undefined'
    ) {
      const raw = (response as Record<string, unknown>).message;
      if (Array.isArray(raw)) {
        return raw.map((item) => String(item)).join('; ');
      }
      if (typeof raw === 'string') return raw;
      return JSON.stringify(raw);
    }
    return defaultMessage;
  }

  private extractDetails(response: unknown): unknown {
    if (!response || typeof response !== 'object') return null;
    const { message, ...rest } = response as Record<string, unknown>;
    if (Array.isArray(message) && message.length > 0) {
      return { message, ...rest };
    }
    return Object.keys(rest).length > 0 ? rest : null;
  }

  private extractCode(response: unknown, status: number): string {
    if (
      response &&
      typeof response === 'object' &&
      'code' in response &&
      typeof (response as Record<string, unknown>).code === 'string'
    ) {
      return (response as Record<string, unknown>).code as string;
    }
    return `HTTP_${status}`;
  }
}
