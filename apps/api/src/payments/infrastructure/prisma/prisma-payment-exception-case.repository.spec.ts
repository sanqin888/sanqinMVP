import type { PrismaService } from '../../../prisma/prisma.service';
import { PrismaPaymentExceptionCaseRepository } from './prisma-payment-transaction.repository';

const existing = {
  caseStableId: 'case-20261017-1',
  attemptId: 'attempt-1',
  storeStableId: '4750_Yonge_Street',
  paymentTransactionId: '11111111-1111-4111-8111-111111111111',
  externalPaymentId: 'sq_one',
  amountCents: 1695,
  currency: 'CAD',
  action: 'SANDBOX_CONFIRM_UNPAID',
  mode: 'SANDBOX',
  status: 'APPROVED',
  requestedByStableId: 'staff-one',
  operatorNote: 'Sandbox operator checked two failed charges',
  cloverOrderId: 'ORDER-ONE',
  approvedByStableId: null,
  approvedAt: null,
  decidedAt: null,
  createdAt: new Date('2026-10-17T20:00:00Z'),
  updatedAt: new Date('2026-10-17T20:00:00Z'),
};

const harness = () => {
  const tx = {
    paymentExceptionCase: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(existing),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentExceptionEvidence: {
      create: jest.fn().mockResolvedValue({ id: 'evidence' }),
    },
    paymentExceptionApproval: {
      create: jest.fn().mockResolvedValue({ id: 'approval' }),
    },
    paymentExceptionExecution: {
      upsert: jest.fn().mockResolvedValue({ caseStableId: existing.caseStableId }),
      update: jest.fn().mockResolvedValue({ caseStableId: existing.caseStableId }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn().mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const repository = new PrismaPaymentExceptionCaseRepository(
    prisma as unknown as PrismaService,
  );
  return { repository, tx };
};

describe('PrismaPaymentExceptionCaseRepository audit/CAS', () => {
  it('reuses the exact original Attempt without creating a second audit case', async () => {
    const { repository, tx } = harness();
    tx.paymentExceptionCase.findUnique.mockResolvedValue(existing);
    await expect(repository.open({
      attemptId: existing.attemptId,
      storeStableId: existing.storeStableId,
      paymentTransactionId: existing.paymentTransactionId,
      externalPaymentId: existing.externalPaymentId,
      amountCents: existing.amountCents,
      currency: existing.currency,
      action: 'SANDBOX_CONFIRM_UNPAID',
      mode: 'SANDBOX',
      requestedByStableId: existing.requestedByStableId,
      operatorNote: existing.operatorNote,
      cloverOrderId: existing.cloverOrderId,
      evidenceCode: 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED',
    })).resolves.toMatchObject({ caseStableId: existing.caseStableId });
    expect(tx.paymentExceptionCase.create.mock.calls).toHaveLength(0);
    expect(tx.paymentExceptionEvidence.create.mock.calls).toHaveLength(0);
  });

  it('rejects a second claimant reusing an Attempt with a different external identity', async () => {
    const { repository, tx } = harness();
    tx.paymentExceptionCase.findUnique.mockResolvedValue(existing);
    await expect(repository.open({
      attemptId: existing.attemptId,
      storeStableId: existing.storeStableId,
      paymentTransactionId: existing.paymentTransactionId,
      externalPaymentId: 'sq_conflicting',
      amountCents: existing.amountCents,
      currency: existing.currency,
      action: 'SANDBOX_CONFIRM_UNPAID',
      mode: 'SANDBOX',
      requestedByStableId: existing.requestedByStableId,
      operatorNote: existing.operatorNote,
      cloverOrderId: existing.cloverOrderId,
      evidenceCode: 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED',
    })).rejects.toThrow('PAYMENT_EXCEPTION_DUPLICATE_ATTEMPT_CONFLICT');
    expect(tx.paymentExceptionCase.create.mock.calls).toHaveLength(0);
  });

  it('blocks self-approval without a status change or approval audit row', async () => {
    const { repository, tx } = harness();
    tx.paymentExceptionCase.findUnique.mockResolvedValue({
      ...existing,
      mode: 'PRODUCTION',
      status: 'REQUESTED',
    });
    await expect(repository.decide({
      caseStableId: existing.caseStableId,
      actorStableId: 'staff-one',
      decision: 'APPROVED',
      note: 'Self approval should never be allowed',
    })).rejects.toThrow('PAYMENT_EXCEPTION_SELF_APPROVAL_FORBIDDEN');
    expect(tx.paymentExceptionCase.updateMany.mock.calls).toHaveLength(0);
    expect(tx.paymentExceptionApproval.create.mock.calls).toHaveLength(0);
  });

  it('saves one approved decision and immutable actor audit in a single transaction', async () => {
    const { repository, tx } = harness();
    tx.paymentExceptionCase.findUnique.mockResolvedValue({
      ...existing,
      mode: 'PRODUCTION',
      status: 'REQUESTED',
    });
    tx.paymentExceptionCase.findUniqueOrThrow.mockResolvedValue({
      ...existing,
      mode: 'PRODUCTION',
      status: 'APPROVED',
      approvedByStableId: 'admin-two',
    });
    await expect(repository.decide({
      caseStableId: existing.caseStableId,
      actorStableId: 'admin-two',
      decision: 'APPROVED',
      note: 'Evidence verified for release only',
    })).resolves.toMatchObject({ status: 'APPROVED' });
    expect(tx.paymentExceptionCase.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { caseStableId: existing.caseStableId, status: 'REQUESTED' },
    });
    expect(tx.paymentExceptionApproval.create.mock.calls[0]?.[0]).toMatchObject({
      data: { actorStableId: 'admin-two', decision: 'APPROVED' },
    });
  });

  it('only one worker can claim a current APPROVED case', async () => {
    const { repository, tx } = harness();
    tx.paymentExceptionCase.findUnique.mockResolvedValue(existing);
    await expect(repository.claimExecution(existing.caseStableId))
      .resolves.toBe('CLAIMED');
    expect(tx.paymentExceptionCase.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: 'APPROVED', updatedAt: existing.updatedAt },
      data: { status: 'EXECUTING' },
    });
    expect(tx.paymentExceptionExecution.upsert.mock.calls).toHaveLength(1);
  });

  it('does not allow competing execution within the active lease', async () => {
    const { repository, tx } = harness();
    tx.paymentExceptionCase.findUnique.mockResolvedValue({
      ...existing,
      status: 'EXECUTING',
      updatedAt: new Date(),
    });
    await expect(repository.claimExecution(existing.caseStableId))
      .resolves.toBe('BUSY');
    expect(tx.paymentExceptionExecution.upsert.mock.calls).toHaveLength(0);
  });

  it('only persists a completed checkpoint after owned EXECUTING CAS', async () => {
    const { repository, tx } = harness();
    await repository.finishExecution(existing.caseStableId, true);
    expect(tx.paymentExceptionCase.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { caseStableId: existing.caseStableId, status: 'EXECUTING' },
      data: { status: 'COMPLETED' },
    });
    expect(tx.paymentExceptionExecution.update.mock.calls).toHaveLength(1);
    expect(tx.paymentExceptionEvidence.create.mock.calls[0]?.[0]).toMatchObject({
      data: { resultCode: 'RECOVERY_COMPLETED' },
    });
  });
});
