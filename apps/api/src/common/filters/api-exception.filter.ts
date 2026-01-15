import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorEnvelope = {
  code: string;
  message: string;
  details: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // ✅ 如果某个 controller 已经手动 send 过响应，就不要再写 headers/body
    if (res.headersSent) {
      // 默认静音，只在需要调试时打印
      if (process.env.DEBUG_API_FILTER === '1') {
        this.logger.debug(
          `Response already sent for ${req.method} ${
            req.url
          }, skipping ApiExceptionFilter. Original error: ${
            exception instanceof Error ? exception.message : String(exception)
          }`,
        );
      }
      return;
    }

    const { status, body } = this.normalizeException(exception);

    const isNotFound = status === HttpStatus.NOT_FOUND;
    const isInternalServerError =
      status === HttpStatus.INTERNAL_SERVER_ERROR;

    if (isNotFound) {
      this.logger.warn(`Request ${req.method} ${req.url} not found.`);
    } else {
      this.logger.error(
        `Request ${req.method} ${req.url} failed with status ${
          body.code
        } (${status}): ${body.message}`,
        isInternalServerError && exception instanceof Error
          ? exception.stack
          : undefined,
      );
    }

    res.status(status).json(body);
  }

  private normalizeException(exception: unknown): {
    status: number;
    body: ErrorEnvelope;
  } {
    // 已知的 HttpException：优先从它的 response 中提取 message / code / details
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

    // 其他异常：统一视为 500
    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    // 生产环境不暴露细节，开发环境可以带 stack / 原始对象
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
