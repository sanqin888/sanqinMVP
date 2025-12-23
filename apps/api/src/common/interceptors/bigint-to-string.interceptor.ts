// apps/api/src/common/interceptors/bigint-to-string.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function convert(value: unknown, seen: WeakSet<object>): unknown {
  // 0) Date -> ISO string
  if (value instanceof Date) {
    return value.toISOString();
  }

  // 1) BigInt -> string
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // 2) null / undefined 原样返回
  if (value === null || value === undefined) {
    return value;
  }

  // 3) 数组：逐项递归
  if (Array.isArray(value)) {
    return value.map((v) => convert(v, seen));
  }

  // 4) 对象：优先使用 toJSON（和 JSON.stringify 行为一致）
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // 避免循环引用导致无限递归
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    const toJson = (obj as { toJSON?: unknown }).toJSON;
    if (typeof toJson === 'function') {
      // 某些类型（如 Prisma Decimal / Date）会有 toJSON
      return convert(toJson.call(obj), seen);
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = convert(val, seen);
    }
    return result;
  }

  // 5) 其他标量类型
  return value;
}

/**
 * 对外导出的工具函数，方便在别的地方（例如 RequestIdInterceptor）直接调用。
 */
export function convertBigIntToString<T>(data: T): T {
  // 这里 convert 返回的是 unknown，强转为 T 会被 eslint 视为可能不安全的返回；
  // 但我们知道它只是把 bigint 变成 string，其余结构保持不变，所以在此关闭该规则。

  return convert(data as unknown, new WeakSet<object>()) as T;
}

/**
 * 全局拦截器：把控制器返回的数据中的 bigint 全部转成字符串
 */
@Injectable()
export class BigIntToStringInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data: unknown) => convertBigIntToString(data)));
  }
}
