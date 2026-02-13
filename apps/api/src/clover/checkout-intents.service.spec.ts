import { PrismaService } from '../prisma/prisma.service';
import { HostedCheckoutMetadata } from './hco-metadata';
import { CheckoutIntentsService } from './checkout-intents.service';

type CheckoutIntentRecord = {
  id: string;
  referenceId: string;
  status?: string;
  orderId?: string | null;
  expiresAt?: Date | null;
  metadataJson: HostedCheckoutMetadata;
};

type CreateIntentArgs = { data: { expiresAt: Date } & Record<string, unknown> };
type FindFirstArgs = {
  where: { referenceId: string };
  orderBy: { createdAt: 'desc' };
};
type FindUniqueArgs = { where: { id?: string; checkoutSessionId?: string } };
type UpdateManyArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

type PrismaMock = {
  checkoutIntent: {
    create: jest.Mock<Promise<CheckoutIntentRecord>, [CreateIntentArgs]>;
    upsert: jest.Mock<Promise<CheckoutIntentRecord>, [Record<string, unknown>]>;
    findUnique: jest.Mock<
      Promise<CheckoutIntentRecord | null>,
      [FindUniqueArgs]
    >;
    findFirst: jest.Mock<Promise<CheckoutIntentRecord | null>, [FindFirstArgs]>;
    updateMany: jest.Mock<Promise<{ count: number }>, [UpdateManyArgs]>;
  };
};

describe('CheckoutIntentsService', () => {
  const createService = () => {
    const prisma: PrismaMock = {
      checkoutIntent: {
        create: jest.fn<Promise<CheckoutIntentRecord>, [CreateIntentArgs]>(),
        upsert: jest.fn<
          Promise<CheckoutIntentRecord>,
          [Record<string, unknown>]
        >(),
        findUnique: jest.fn<
          Promise<CheckoutIntentRecord | null>,
          [FindUniqueArgs]
        >(),
        findFirst: jest.fn<
          Promise<CheckoutIntentRecord | null>,
          [FindFirstArgs]
        >(),
        updateMany: jest.fn<Promise<{ count: number }>, [UpdateManyArgs]>(),
      },
    };

    const service = new CheckoutIntentsService(
      prisma as unknown as PrismaService,
    );

    return { prisma, service };
  };

  const baseMetadata: HostedCheckoutMetadata = {
    locale: 'en',
    customer: { email: 'a@test.com' },
    items: [],
  };

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

    const createArgs = prisma.checkoutIntent.create.mock.calls[0]?.[0];

    expect(createArgs?.data.expiresAt.toISOString()).toBe(
      '2026-01-01T00:20:00.000Z',
    );
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

    await expect(
      service.findByIdentifiers({ referenceId: 'ref-1' }),
    ).resolves.toMatchObject({ status: 'expired' });

    const updateManyArgs = prisma.checkoutIntent.updateMany.mock.calls[0]?.[0];

    expect(updateManyArgs?.where).toMatchObject({
      id: 'intent-1',
      status: 'pending',
    });
    expect(updateManyArgs?.data).toMatchObject({
      status: 'expired',
      result: 'EXPIRED',
    });
  });

  it('renews expiresAt when resetting an expired intent for retry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { prisma, service } = createService();

    prisma.checkoutIntent.updateMany.mockResolvedValue({ count: 1 });

    await service.resetForRetry('intent-1');

    const updateManyArgs = prisma.checkoutIntent.updateMany.mock.calls[0]?.[0];

    expect(updateManyArgs?.data).toMatchObject({
      status: 'pending',
      expiresAt: new Date('2026-01-01T00:20:00.000Z'),
    });
  });
});
