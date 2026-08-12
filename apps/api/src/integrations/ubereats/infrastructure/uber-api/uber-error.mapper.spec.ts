import {
  safeStructuredError,
  summarizeWebhookError,
} from './uber-error.mapper';

describe('Uber error mapper', () => {
  it('redacts structured Uber errors', () => {
    const result = safeStructuredError({
      uberCode: 'BAD_REQUEST',
      safeDetail: 'authorization: Bearer secret-token',
      operation: 'menu.upload',
    });
    expect(result.code).toBe('BAD_REQUEST');
    expect(result.detail).not.toContain('secret-token');
  });

  it('redacts non-structured errors', () => {
    const result = summarizeWebhookError(
      new Error('access_token=secret-token&store=store-1'),
    );
    expect(result).not.toContain('secret-token');
    expect(result).toContain('[REDACTED]');
  });
});
