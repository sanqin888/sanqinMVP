import { PrismaPaymentTerminalOperationRepository } from './prisma-payment-transaction.repository';

const input = {
  attemptId: 'attempt-sandbox-504',
  paymentTransactionId: '3b5894e9-8d5b-4bac-9c6b-bcf9b5e53410',
  terminalId: 'compact-test-1',
  storeStableId: '4750_Yonge_Street',
  externalPaymentId: 'sq_test_orig_504',
  actorUserStableId: 'coperator-sandbox',
  cloverOrderId: 'J69R16PIHFKYG',
  operatorNote: 'Test Merchant Open order showed No Payments',
  originalResultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
  originalFailureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
  canonicalCheckedAt: new Date('2026-10-15T19:00:00.000Z'),
};

const setup = () => {
  const tx = {
    paymentTerminalSandboxRecovery: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(input),
      update: jest.fn().mockResolvedValue(input),
    },
    paymentTerminalOperation: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentTransaction: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation(
      (action: (transaction: typeof tx) => Promise<unknown>) => action(tx),
    ),
    paymentTerminalSandboxRecovery: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const repository = new PrismaPaymentTerminalOperationRepository(
    prisma as unknown as ConstructorParameters<
      typeof PrismaPaymentTerminalOperationRepository
    >[0],
  );
  return { repository, tx, prisma };
};

describe('Sandbox-only operator unpaid persistence', () => {
  it('records original evidence and payment FAILED as one CAS transaction', async () => {
    const { repository, tx } = setup();
    await expect(repository.claimSandboxManualUnpaid(input))
      .resolves.toBe('CLAIMED');
    expect(tx.paymentTerminalOperation.updateMany.mock.calls[0]?.[0])
      .toMatchObject({
        where: {
          terminalId: input.terminalId,
          attemptId: input.attemptId,
          state: 'SALE_IN_FLIGHT',
          cancelRequestedAt: null,
        },
        data: { state: 'NEEDS_REVIEW' },
      });
    expect(tx.paymentTransaction.updateMany.mock.calls[0]?.[0])
      .toMatchObject({
        where: {
          id: input.paymentTransactionId,
          status: 'RECONCILING',
          resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
          failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
          providerPaymentId: null,
        },
        data: {
          status: 'FAILED',
          resultCode: 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID',
        },
      });
    expect(tx.paymentTerminalSandboxRecovery.create.mock.calls[0]?.[0])
      .toEqual({ data: input });
  });

  it('cannot mark a payment failed when a terminal fence is already owned', async () => {
    const { repository, tx } = setup();
    tx.paymentTerminalOperation.updateMany.mockResolvedValue({ count: 0 });
    await expect(repository.claimSandboxManualUnpaid(input))
      .resolves.toBe('CONFLICT');
    expect(tx.paymentTransaction.updateMany.mock.calls).toHaveLength(0);
    expect(tx.paymentTerminalSandboxRecovery.create.mock.calls).toHaveLength(0);
  });

  it('refuses finalization until Benefits RELEASE and excludes late Clover success', async () => {
    const { repository, tx } = setup();
    tx.paymentTerminalSandboxRecovery.findUnique.mockResolvedValue({
      ...input,
      benefitsReleasedAt: null,
      terminalFinalizedAt: null,
      lateCanonicalAt: null,
    });
    await expect(repository.finalizeSandboxManualUnpaid(input.attemptId))
      .resolves.toBe(false);
    expect(tx.paymentTerminalOperation.updateMany.mock.calls).toHaveLength(0);
    tx.paymentTerminalSandboxRecovery.findUnique.mockResolvedValue({
      ...input,
      benefitsReleasedAt: new Date(),
      terminalFinalizedAt: null,
      lateCanonicalAt: new Date(),
    });
    await expect(repository.finalizeSandboxManualUnpaid(input.attemptId))
      .resolves.toBe(false);
    expect(tx.paymentTerminalOperation.updateMany.mock.calls).toHaveLength(0);
  });
});
