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

  if (mode !== 'process' && mode !== 'database') {
    errors.push('UBER_EATS_RATE_LIMITER_MODE 必须为 process 或 database');
  }
  if (mode === 'database') {
    if (present(env.UBER_EATS_SINGLE_REPLICA)) {
      errors.push('database 模式不得设置 UBER_EATS_SINGLE_REPLICA');
    }
  }
  if (mode === 'process') {
    if (!/^(1|true|yes)$/i.test(env.UBER_EATS_SINGLE_REPLICA ?? '')) {
      errors.push('process 模式要求 UBER_EATS_SINGLE_REPLICA=true');
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
      const parsed: unknown = JSON.parse(env.UBER_CREDENTIAL_ENCRYPTION_KEYS!);
      if (!isKeyRingObject(parsed)) {
        errors.push(
          'UBER_CREDENTIAL_ENCRYPTION_KEYS 必须为普通 JSON object key ring',
        );
      } else {
        const activeVersion = env.UBER_CREDENTIAL_ACTIVE_KEY_VERSION!;
        if (Object.keys(parsed).length === 0) {
          errors.push('UBER_CREDENTIAL_ENCRYPTION_KEYS 不得为空对象');
        }
        if (!Object.prototype.hasOwnProperty.call(parsed, activeVersion)) {
          errors.push(
            'UBER_CREDENTIAL_ACTIVE_KEY_VERSION 不在 credential key ring 中',
          );
        }
        if (
          Object.entries(parsed).some(
            ([version, value]) =>
              !/^\d+$/.test(version) ||
              typeof value !== 'string' ||
              !isBase64Key(value),
          )
        ) {
          errors.push('UBER_CREDENTIAL_ENCRYPTION_KEYS 格式无效');
        }
      }
    } catch {
      errors.push('UBER_CREDENTIAL_ENCRYPTION_KEYS 必须为 JSON key ring');
    }
  }
  throwIfInvalid(errors, env);
}

function throwIfInvalid(errors: string[], env: NodeJS.ProcessEnv): void {
  if (env.UBER_CREDENTIAL_KEYS_SOURCE !== 'env') {
    errors.push('UBER_CREDENTIAL_KEYS_SOURCE 必须为 env');
  }

  if (errors.length) {
    throw new Error(
      `Uber Eats 启动配置无效（${errors.length} 项）：\n- ${errors.join('\n- ')}`,
    );
  }
}

function isBase64Key(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0)
    return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}

function isKeyRingObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
