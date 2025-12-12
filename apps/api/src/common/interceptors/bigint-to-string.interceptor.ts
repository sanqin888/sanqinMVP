// apps/api/src/common/interceptors/bigint-to-string.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 内部递归函数：
 * - 把所有 bigint 转成 string
 * - 递归处理数组和普通对象
 * - 用 WeakSet 防止循环引用导致无限递归
 */
function convert(value: unknown, seen: WeakSet<object>): unknown {
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

  // 4) 普通对象：递归处理每个字段
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;

    // 避免循环引用导致无限递归
    if (seen.has(obj)) {
      // 对于日志 / 序列化用途，用占位字符串即可
      return '[Circular]';
    }
    seen.add(obj);

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = convert(val, seen);
    }
    return result;
  }

  // 5) 其他标量类型（string/number/boolean/symbol 等）直接返回
  return value;
}

/**
 * 对外导出的工具函数，方便在别的地方（例如 RequestIdInterceptor）直接调用。
 */
export function convertBigIntToString<T>(data: T): T {
  // 这里 convert 返回的是 unknown，强转为 T 会被 eslint 视为可能不安全的返回；
  // 但我们知道它只是把 bigint 变成 string，其余结构保持不变，所以在此关闭该规则。
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
    return next.handle().pipe(map((data) => convertBigIntToString(data)));
  }
}
