import { UberTelemetryService } from './uber-telemetry.service';

describe('UberTelemetryService', () => {
  it('仅保留关联字段和 allowlist 字段', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new UberTelemetryService({ opsEvent: { upsert } } as never);
    await service.captureEvent('processed', {
      eventId: 'evt-1',
      operation: 'webhook',
      token: 'secret',
      phone: '+1 555 123 4567',
      payload: { customer: 'private' },
      arbitrary: 'drop',
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: 'evt-1' },
      create: {
        idempotencyKey: 'evt-1',
        eventName: 'processed',
        source: 'ubereats',
        payload: { operation: 'webhook', eventId: 'evt-1' },
      },
      update: {},
    });
  });

  it('没有事件唯一键时仍记录独立 telemetry', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new UberTelemetryService({ opsEvent: { create } } as never);

    await service.captureEvent('heartbeat');

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('只接受低基数标签并聚合 metric', () => {
    const service = new UberTelemetryService({} as never);
    service.increment('ubereats_api_429_total', {
      operation: 'get_order',
      externalOrderId: 'high-cardinality',
    });
    service.increment('ubereats_api_429_total', { operation: 'get_order' }, 2);
    expect(service.metricSnapshot()).toEqual({
      'ubereats_api_429_total{operation=get_order}': 3,
    });
  });
});
