// apps/api/src/common/app-logger.ts
import { Logger } from '@nestjs/common';
import { getLogContext } from './log-context';

export class AppLogger extends Logger {
  private prefixMessage(message: unknown): unknown {
    const ctx = getLogContext();
    const reqId = ctx?.requestId;

    if (!reqId || typeof message !== 'string') {
      return message;
    }

    // 避免重复加前缀
    if (message.startsWith('[reqId=')) {
      return message;
    }

    return `[reqId=${reqId}] ${message}`;
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    super.log(this.prefixMessage(message), ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    super.error(this.prefixMessage(message), ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    super.warn(this.prefixMessage(message), ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    super.debug?.(this.prefixMessage(message), ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    super.verbose?.(this.prefixMessage(message), ...optionalParams);
  }
}
