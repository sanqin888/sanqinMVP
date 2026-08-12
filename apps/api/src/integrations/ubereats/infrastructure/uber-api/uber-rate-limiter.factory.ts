import { UberApiConfigService } from './uber-api-config.service';
import type { UberRateLimiterMetricsPort } from '../../application/ports/uber-rate-limiter.port';
import { ProcessUberRateLimiter } from './uber-rate-limiter';
import {
  DistributedUberRateLimiter,
  RedisHttpAtomicCommandStore,
} from './uber-distributed-rate-limiter';

export function createUberRateLimiter(
  env: NodeJS.ProcessEnv,
  config: UberApiConfigService,
  metrics: UberRateLimiterMetricsPort,
) {
  const mode = env.UBER_EATS_RATE_LIMITER_MODE;
  if (mode !== 'process' && mode !== 'distributed')
    throw new Error(
      '必须明确配置 UBER_EATS_RATE_LIMITER_MODE=process|distributed',
    );
  if (
    mode === 'process' &&
    env.NODE_ENV === 'production' &&
    !/^(1|true|yes)$/i.test(env.UBER_EATS_SINGLE_REPLICA ?? '')
  )
    throw new Error(
      '生产多副本禁止进程内 Uber 限流器；仅单副本可设置 UBER_EATS_SINGLE_REPLICA=true',
    );
  if (mode === 'process') return new ProcessUberRateLimiter(config, metrics);
  const url = env.UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL;
  const token = env.UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN;
  if (!url || !token)
    throw new Error('分布式 Uber 限流器缺少 Redis HTTP URL/token');
  return new DistributedUberRateLimiter(
    config,
    new RedisHttpAtomicCommandStore(url, token),
    metrics,
  );
}
