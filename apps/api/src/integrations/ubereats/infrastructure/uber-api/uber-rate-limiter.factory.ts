import { UberApiConfigService } from './uber-api-config.service';
import type {
  UberRateLimitCoordinationRepositoryPort,
  UberRateLimiterMetricsPort,
} from '../../application/shared/uber-rate-limiter.port';
import { ProcessUberRateLimiter } from './uber-rate-limiter';
import { DatabaseUberRateLimiter } from './uber-database-rate-limiter';

export function createUberRateLimiter(
  env: NodeJS.ProcessEnv,
  config: UberApiConfigService,
  metrics: UberRateLimiterMetricsPort,
  repository: UberRateLimitCoordinationRepositoryPort,
) {
  const mode = env.UBER_EATS_RATE_LIMITER_MODE;
  if (mode !== 'process' && mode !== 'database')
    throw new Error(
      '必须明确配置 UBER_EATS_RATE_LIMITER_MODE=process|database',
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
  return new DatabaseUberRateLimiter(config, repository, metrics);
}
