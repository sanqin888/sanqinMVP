import { PosExchangeRateService } from './pos-exchange-rate.service';

type PrismaMock = {
  businessConfig: {
    findUnique: jest.Mock;
  };
};

const originalFetch = global.fetch;

function bankResponseFromObservations(observations: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ observations }),
  } as unknown as Response;
}

function bankResponse(date: string, value: string): Response {
  return bankResponseFromObservations([
    {
      d: date,
      FXCNYCAD: { v: value },
    },
  ]);
}

function setup(fallbackRate = 4.85) {
  const prisma: PrismaMock = {
    businessConfig: {
      findUnique: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
        wechatAlipayExchangeRate: fallbackRate,
      }),
    },
  };
  const service = new PosExchangeRateService(prisma as never);
  Reflect.set(service, 'logger', {
    log: jest.fn(),
    warn: jest.fn(),
  });
  return { service };
}

describe('PosExchangeRateService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-24T20:00:00.000Z')); // 16:00 Toronto
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it(
    'uses a two-decimal CAD/CNY rate for both display and backend amount conversion',
    async () => {
      const { service } = setup();
      global.fetch = jest
        .fn()
        .mockResolvedValue(bankResponse('2026-08-21', '0.2047'));

      await expect(service.quoteCadToCny(2345)).resolves.toEqual({
        cadAmountCents: 2345,
        cnyAmountFen: 11467,
        cadToCnyRate: 4.89,
        rateDate: '2026-08-21',
        source: 'BANK_OF_CANADA',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await service.quoteCadToCny(1000);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'refreshes once on the first quote at or after 17:00 and adopts a newer observation',
    async () => {
      const { service } = setup();
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(bankResponse('2026-08-21', '0.2047'))
        .mockResolvedValueOnce(bankResponse('2026-08-24', '0.2060'));

      await service.quoteCadToCny(1000);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date('2026-08-24T21:00:05.000Z')); // 17:00 Toronto
      await expect(service.quoteCadToCny(1000)).resolves.toMatchObject({
        cnyAmountFen: 4850,
        cadToCnyRate: 4.85,
        rateDate: '2026-08-24',
        source: 'BANK_OF_CANADA',
      });
      await service.quoteCadToCny(1000);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    },
  );

  it(
    'keeps the cached rate when the first post-17:00 quote has no newer observation',
    async () => {
      const { service } = setup();
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(bankResponse('2026-08-21', '0.2047'))
        .mockResolvedValueOnce(bankResponse('2026-08-21', '0.2047'));

      await service.quoteCadToCny(1000);
      jest.setSystemTime(new Date('2026-08-24T21:00:05.000Z'));

      await expect(service.quoteCadToCny(1000)).resolves.toMatchObject({
        cnyAmountFen: 4890,
        cadToCnyRate: 4.89,
        rateDate: '2026-08-21',
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    },
  );

  it(
    'uses the most recent valid observation when a newer date has no published value',
    async () => {
      const { service } = setup();
      global.fetch = jest.fn().mockResolvedValue(
        bankResponseFromObservations([
          { d: '2026-08-21', FXCNYCAD: { v: '0.2047' } },
          { d: '2026-08-24', FXCNYCAD: { e: -64 } },
        ]),
      );

      await expect(service.quoteCadToCny(1000)).resolves.toMatchObject({
        cnyAmountFen: 4890,
        cadToCnyRate: 4.89,
        rateDate: '2026-08-21',
      });
    },
  );

  it(
    'uses the BusinessConfig rate rounded to two decimals only when no Bank of Canada cache exists',
    async () => {
      const { service } = setup(4.856);
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      await expect(service.quoteCadToCny(1000)).resolves.toEqual({
        cadAmountCents: 1000,
        cnyAmountFen: 4860,
        cadToCnyRate: 4.86,
        rateDate: null,
        source: 'BUSINESS_CONFIG_FALLBACK',
      });
    },
  );

  it('rejects non-integer CAD cents', async () => {
    const { service } = setup();
    await expect(service.quoteCadToCny(100.5)).rejects.toThrow(
      'cadAmountCents must be a non-negative safe integer',
    );
    expect(global.fetch).toBe(originalFetch);
  });
});
