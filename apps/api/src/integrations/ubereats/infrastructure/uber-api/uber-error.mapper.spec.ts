import {
  mapUberGatewayFailure,
  safeStructuredError,
  summarizeWebhookError,
} from './uber-error.mapper';

describe('Uber error mapper', () => {
  it('maps transport, HTTP and mapping failures without exposing HTTP status', () => {
    const transport = mapUberGatewayFailure({
      kind: 'transport',
      operation: 'stores.list',
      code: 'UBER_NETWORK_ERROR',
    });
    const http = mapUberGatewayFailure({
      kind: 'http',
      operation: 'stores.list',
      status: 503,
      upstreamCode: 'service-unavailable',
    });
    const mapping = mapUberGatewayFailure({
      kind: 'mapping',
      operation: 'stores.list',
      code: 'UBER_STORE_MAPPING_FAILED',
      reason: 'Uber 门店响应无法映射',
    });

    expect(transport).toMatchObject({
      category: 'transient-upstream',
      code: 'UBER_NETWORK_ERROR',
    });
    expect(http).toMatchObject({
      category: 'transient-upstream',
      code: 'UBER_SERVICE_UNAVAILABLE',
      upstreamStatus: null,
    });
    expect(mapping).toMatchObject({
      category: 'non-retryable-upstream',
      code: 'UBER_STORE_MAPPING_FAILED',
    });
  });

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
