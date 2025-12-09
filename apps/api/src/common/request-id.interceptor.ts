// apps/api/src/common/request-id.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { runWithLogContext } from './log-context';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestIdInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // 只处理 HTTP 请求
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request & { requestId?: string }>();
    const response = httpCtx.getResponse<Response>();

    const start = Date.now();

    // 1) 从请求头里拿 requestId（如果客户端自己传了）
    const headerId = (request.headers['x-request-id'] ??
      request.headers['x-requestid']) as string | undefined;

    const trimmedHeaderId =
      typeof headerId === 'string' && headerId.trim().length > 0
        ? headerId.trim()
        : undefined;

    // 2) 如果没有就自己生成一个简单的 ID
    const requestId =
      trimmedHeaderId ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // 挂到 req 上，方便偶尔直接从 req 读取
    request.requestId = requestId;

    // 写回响应头，方便前端或监控用
    if (response && typeof response.setHeader === 'function') {
      response.setHeader('x-request-id', requestId);
    }

    const { method, url } = request;

    // 3) runWithLogContext：把 requestId 写入 AsyncLocalStorage
    return runWithLogContext({ requestId }, () =>
      next.handle().pipe(
        tap({
          next: () => {
            const ms = Date.now() - start;
            const status = response?.statusCode;
            this.logger.log(
              `[reqId=${requestId}] ${method} ${url} - ${status} (${ms}ms)`,
            );
          },
          error: (err: unknown) => {
            const ms = Date.now() - start;
            const status = response?.statusCode;
            this.logger.error(
              `[reqId=${requestId}] ${method} ${url} - ${status} (${ms}ms)`,
              err instanceof Error ? err.stack : undefined,
            );
          },
        }),
      ),
    );
  }
}
