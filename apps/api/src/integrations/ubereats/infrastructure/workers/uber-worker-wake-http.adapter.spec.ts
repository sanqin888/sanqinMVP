import { UberWorkerConfigService } from './uber-worker-config.service';
import { UberWorkerWakeHttpAdapter } from './uber-worker-wake-http.adapter';

describe('UberWorkerWakeHttpAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('does nothing when no wake endpoint is configured', () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const adapter = new UberWorkerWakeHttpAdapter(
      new UberWorkerConfigService({}),
    );

    adapter.signal('orderAction');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['webhookInbox', '/wake/webhook-inbox'],
    ['orderAction', '/wake/order-action'],
  ] as const)('posts a best-effort wake for %s', (target, path) => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const adapter = new UberWorkerWakeHttpAdapter(
      new UberWorkerConfigService({
        UBER_EATS_WORKER_WAKE_URL: 'http://ubereats-worker:4001',
        UBER_EATS_WORKER_WAKE_TIMEOUT_MS: '500',
      }),
    );

    adapter.signal(target);

    expect(fetchSpy).toHaveBeenCalledWith(
      `http://ubereats-worker:4001${path}`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
