import {
  PaymentTransactionUniquenessError,
} from '../../application/payment-transaction.repository';
import { PaymentTransaction } from '../../domain/payment-transaction';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PrismaPaymentTransactionRepository,
} from './prisma-payment-transaction.repository';

const persistedRow = {
  id: '0f9a2139-c482-4ad6-946e-16642f078a0a',
  attemptId: 'attempt-1',
  idempotencyKey: 'attempt-1-sale',
  orderId: null,
  checkoutIntentId: null,
  provider: 'CLOVER',
  source: 'POS_TERMINAL',
  paymentMethod: 'CARD',
  operation: 'SALE' as const,
  amountCents: 1299,
  surchargeCents: null,
  chargedTotalCents: null,
  refundedAmountCents: 0,
  currency: 'CAD',
  status: 'CREATED' as const,
  externalPaymentId: null,
  providerPaymentId: null,
  providerRefundId: null,
  providerOrderId: null,
  resultCode: null,
  failureCode: null,
  failureMessage: null,
  terminalId: null,
  cardBrand: null,
  cardLast4: null,
  processedAt: null,
  completedAt: null,
  createdAt: new Date('2026-08-25T20:00:00.000Z'),
  updatedAt: new Date('2026-08-25T20:00:00.000Z'),
};

describe('PrismaPaymentTransactionRepository', () => {
  it('persists the provider-independent payment snapshot', async () => {
    const create = jest.fn().mockResolvedValue(persistedRow);
    const repository = new PrismaPaymentTransactionRepository({
      paymentTransaction: { create },
    } as unknown as PrismaService);
    const transaction = PaymentTransaction.create({
      id: persistedRow.id,
      attemptId: persistedRow.attemptId,
      idempotencyKey: persistedRow.idempotencyKey,
      provider: 'CLOVER',
      source: 'POS_TERMINAL',
      paymentMethod: 'CARD',
      operation: 'SALE',
      amountCents: 1299,
      currency: 'CAD',
      createdAt: persistedRow.createdAt,
    });

    const saved = await repository.create(transaction);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: persistedRow.id,
        attemptId: persistedRow.attemptId,
        idempotencyKey: persistedRow.idempotencyKey,
        provider: 'CLOVER',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: 'SALE',
        status: 'CREATED',
        amountCents: 1299,
        surchargeCents: null,
        chargedTotalCents: null,
      }),
    });
    expect(saved.toSnapshot()).toMatchObject({
      id: persistedRow.id,
      attemptId: persistedRow.attemptId,
      status: 'CREATED',
    });
  });

  it(
    'maps Prisma attempt uniqueness into the repository boundary error',
    async () => {
      const error = {
        code: 'P2002',
        meta: { target: ['attemptId'] },
      };
      const repository = new PrismaPaymentTransactionRepository({
        paymentTransaction: { create: jest.fn().mockRejectedValue(error) },
      } as unknown as PrismaService);
      const transaction = PaymentTransaction.create({
        id: persistedRow.id,
        attemptId: persistedRow.attemptId,
        idempotencyKey: persistedRow.idempotencyKey,
        provider: 'CLOVER',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: 'SALE',
        amountCents: 1299,
        currency: 'CAD',
      });

      await expect(repository.create(transaction)).rejects.toEqual(
        new PaymentTransactionUniquenessError('attemptId'),
      );
    },
  );

  it(
    'maps provider external payment id uniqueness into the repository boundary error',
    async () => {
      const error = {
        code: 'P2002',
        meta: { target: ['provider', 'externalPaymentId'] },
      };
      const repository = new PrismaPaymentTransactionRepository({
        paymentTransaction: { create: jest.fn().mockRejectedValue(error) },
      } as unknown as PrismaService);
      const transaction = PaymentTransaction.create({
        id: persistedRow.id,
        attemptId: persistedRow.attemptId,
        idempotencyKey: persistedRow.idempotencyKey,
        provider: 'CLOVER',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: 'SALE',
        amountCents: 1299,
        currency: 'CAD',
        externalPaymentId: 'external-1',
      });

      await expect(repository.create(transaction)).rejects.toEqual(
        new PaymentTransactionUniquenessError('externalPaymentId'),
      );
    },
  );

  it(
    'rejects unknown persisted classifications instead of leaking raw strings into domain',
    async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValue({ ...persistedRow, provider: 'UNKNOWN_PROVIDER' });
      const repository = new PrismaPaymentTransactionRepository({
        paymentTransaction: { findUnique },
      } as unknown as PrismaService);

      await expect(repository.findById(persistedRow.id)).rejects.toThrow(
        'Unknown payment provider',
      );
    },
  );
});
