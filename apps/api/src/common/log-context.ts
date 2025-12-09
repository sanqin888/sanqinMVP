// apps/api/src/common/log-context.ts
import { AsyncLocalStorage } from 'async_hooks';

export interface LogContext {
  requestId?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}
