import { CheckoutIntentsService } from './checkout-intents.service';

describe('CheckoutIntentsService', () => {
  const createService = () => {
    const prisma = {
      checkoutIntent: {
        create: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    } as any;

    const service = new CheckoutIntentsService(prisma);
    return { prisma, service };
  };

  const baseMetadata = {
    locale: 'en',
    customer: { email: 'a@test.com' },
    items: [],
  } as any;

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('uses fixed 20-minute pending expiry window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { prisma, service } = createService();

    prisma.checkoutIntent.create.mockResolvedValue({
      id: 'id-1',
      referenceId: 'ref-1',
      metadataJson: baseMetadata,
    });

    await service.recordIntent({
      referenceId: 'ref-1',
      amountCents: 100,
      currency: 'CAD',
      metadata: baseMetadata,
    });

    const call = prisma.checkoutIntent.create.mock.calls[0][0];
    expect(call.data.expiresAt.toISOString()).toBe('2026-01-01T00:20:00.000Z');
  });

  it('marks pending intent as expired when fetching an overdue intent', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:30:00.000Z'));
    const { prisma, service } = createService();

    prisma.checkoutIntent.findFirst.mockResolvedValueOnce({
      id: 'intent-1',
      referenceId: 'ref-1',
      status: 'pending',
      orderId: null,
      expiresAt: new Date('2026-01-01T00:10:00.000Z'),
      metadataJson: baseMetadata,
    });
    prisma.checkoutIntent.updateMany.mockResolvedValue({ count: 1 });
    prisma.checkoutIntent.findUnique.mockResolvedValueOnce({
      id: 'intent-1',
      referenceId: 'ref-1',
      status: 'expired',
      orderId: null,
      expiresAt: new Date('2026-01-01T00:10:00.000Z'),
      metadataJson: baseMetadata,
    });

    const result = await service.findByIdentifiers({ referenceId: 'ref-1' });

    expect(prisma.checkoutIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'intent-1', status: 'pending' }),
        data: expect.objectContaining({ status: 'expired', result: 'EXPIRED' }),
      }),
    );
    expect(result?.status).toBe('expired');
  });

  it('renews expiresAt when resetting an expired intent for retry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { prisma, service } = createService();

    await service.resetForRetry('intent-1');

    expect(prisma.checkoutIntent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'pending',
          expiresAt: new Date('2026-01-01T00:20:00.000Z'),
        }),
      }),
    );
  });
});
