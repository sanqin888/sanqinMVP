export const UBER_EATS_STARTUP_CONFIG = Symbol('UBER_EATS_STARTUP_CONFIG');

const present = (value: string | undefined): boolean => Boolean(value?.trim());

/**
 * Validates cross-cutting Uber Eats settings before any config-specific
 * provider is constructed. Keep this as the single startup error boundary.
 */
export function validateUberEatsStartupConfig(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const errors: string[] = [];
  const mode = env.UBER_EATS_RATE_LIMITER_MODE?.trim();

  if (mode !== 'process' && mode !== 'distributed') {
    errors.push('UBER_EATS_RATE_LIMITER_MODE 必须为 process 或 distributed');
  }
  if (mode === 'distributed') {
    for (const name of [
      'UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL',
      'UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN',
    ] as const) {
      if (!present(env[name])) errors.push(`${name} 缺失`);
    }
    if (present(env.UBER_EATS_SINGLE_REPLICA)) {
      errors.push('distributed 模式不得设置 UBER_EATS_SINGLE_REPLICA');
    }
  }
  if (mode === 'process') {
    if (!/^(1|true|yes)$/i.test(env.UBER_EATS_SINGLE_REPLICA ?? '')) {
      errors.push('process 模式要求 UBER_EATS_SINGLE_REPLICA=true');
    }
    if (
      present(env.UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL) ||
      present(env.UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN)
    ) {
      errors.push('process 模式不得设置 Redis HTTP URL/token');
    }
  }

  for (const name of [
    'UBER_CREDENTIAL_ENCRYPTION_KEYS',
    'UBER_CREDENTIAL_ACTIVE_KEY_VERSION',
  ] as const) {
    if (!present(env[name])) errors.push(`${name} 缺失`);
  }
  if (
    present(env.UBER_CREDENTIAL_ENCRYPTION_KEYS) &&
    present(env.UBER_CREDENTIAL_ACTIVE_KEY_VERSION)
  ) {
    try {
      const keyRing = JSON.parse(
        env.UBER_CREDENTIAL_ENCRYPTION_KEYS!,
      ) as Record<string, string>;
      const activeVersion = env.UBER_CREDENTIAL_ACTIVE_KEY_VERSION!;
      if (!Object.prototype.hasOwnProperty.call(keyRing, activeVersion)) {
        errors.push(
          'UBER_CREDENTIAL_ACTIVE_KEY_VERSION 不在 credential key ring 中',
        );
      }
      if (
        Object.entries(keyRing).some(
          ([version, value]) =>
            !/^\d+$/.test(version) ||
            Buffer.from(value, 'base64').length !== 32,
        )
      ) {
        errors.push('UBER_CREDENTIAL_ENCRYPTION_KEYS 格式无效');
      }
    } catch {
      errors.push('UBER_CREDENTIAL_ENCRYPTION_KEYS 必须为 JSON key ring');
    }
  }
  if (env.UBER_CREDENTIAL_KEYS_SOURCE !== 'secrets-manager') {
    errors.push('UBER_CREDENTIAL_KEYS_SOURCE 必须为 secrets-manager');
  }

  if (errors.length) {
    throw new Error(
      `Uber Eats 启动配置无效（${errors.length} 项）：\n- ${errors.join('\n- ')}`,
    );
  }
}
