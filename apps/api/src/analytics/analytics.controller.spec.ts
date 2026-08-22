import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController consent gate', () => {
  it('does not ingest optional analytics without accepted consent cookie', async () => {
    const ingestBatch = jest.fn();
    const controller = new AnalyticsController({ ingestBatch } as never);

    await expect(
      controller.ingestEvents(
        { events: [{ event: 'checkout_clicked' }] },
        undefined,
        'test-agent',
        '127.0.0.1',
      ),
    ).resolves.toEqual({ accepted: 0 });

    expect(ingestBatch).not.toHaveBeenCalled();
  });

  it('ingests analytics when the consent cookie is accepted', async () => {
    const ingestBatch = jest.fn().mockResolvedValue(1);
    const controller = new AnalyticsController({ ingestBatch } as never);

    await expect(
      controller.ingestEvents(
        { events: [{ event: 'checkout_clicked' }], locale: 'en', path: '/en' },
        'foo=bar; sanqin_analytics_consent_v1=accepted; session=value',
        'test-agent',
        '127.0.0.1',
      ),
    ).resolves.toEqual({ accepted: 1 });

    expect(ingestBatch).toHaveBeenCalledWith([{ event: 'checkout_clicked' }], {
      locale: 'en',
      path: '/en',
      userAgent: 'test-agent',
      ipAddress: '127.0.0.1',
    });
  });

  it('does not accept a rejected consent cookie', async () => {
    const ingestBatch = jest.fn();
    const controller = new AnalyticsController({ ingestBatch } as never);

    await expect(
      controller.ingestEvents(
        { events: [{ event: 'page_view' }] },
        'sanqin_analytics_consent_v1=rejected',
      ),
    ).resolves.toEqual({ accepted: 0 });

    expect(ingestBatch).not.toHaveBeenCalled();
  });
});
