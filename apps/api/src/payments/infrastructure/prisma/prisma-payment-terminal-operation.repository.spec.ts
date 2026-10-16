import { PrismaPaymentTerminalOperationRepository } from './prisma-payment-transaction.repository';

const initial = (
  state: 'RESERVED' | 'SALE_IN_FLIGHT' | 'CANCEL_REQUESTED' | 'FINALIZED',
) => ({
  terminalId: 'compact-1',
  storeStableId: '4750_Yonge_Street',
  attemptId: 'attempt-1',
  paymentTransactionId: null,
  externalPaymentId: null,
  state,
  cancelRequestedAt: null,
  cancelAcknowledgedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const setup = () => {
  const prisma = {
    paymentTerminalOperation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const repository = new PrismaPaymentTerminalOperationRepository(
    prisma as unknown as ConstructorParameters<
      typeof PrismaPaymentTerminalOperationRepository
    >[0],
  );
  return { repository, table: prisma.paymentTerminalOperation };
};

describe('PrismaPaymentTerminalOperationRepository fencing', () => {
  it('does not reassign a device held by another unfinished Attempt', async () => {
    const { repository, table } = setup();
    table.findUnique.mockResolvedValue(initial('SALE_IN_FLIGHT'));
    expect(
      await repository.reserve('compact-1', '4750_Yonge_Street', 'attempt-2'),
    ).toBe(false);
    expect(table.updateMany).not.toHaveBeenCalled();
    expect(table.create).not.toHaveBeenCalled();
  });

  it('allows a new Attempt only after the prior operation is FINALIZED with CAS', async () => {
    const { repository, table } = setup();
    table.findUnique.mockResolvedValue(initial('FINALIZED'));
    table.updateMany.mockResolvedValue({ count: 1 });
    expect(
      await repository.reserve('compact-1', '4750_Yonge_Street', 'attempt-2'),
    ).toBe(true);
    expect(table.updateMany).toHaveBeenCalledWith({
      where: {
        terminalId: 'compact-1',
        attemptId: 'attempt-1',
        state: 'FINALIZED',
      },
      data: {
        storeStableId: '4750_Yonge_Street',
        attemptId: 'attempt-2',
        paymentTransactionId: null,
        externalPaymentId: null,
        state: 'RESERVED',
        cancelRequestedAt: null,
        cancelAcknowledgedAt: null,
      },
    });
  });

  it('permits only the winning competing Attempt to replace a FINALIZED slot', async () => {
    const { repository, table } = setup();
    // Both callers read the same finalized row before the conditional write.
    table.findUnique.mockResolvedValue(initial('FINALIZED'));
    table.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [first, second] = await Promise.all([
      repository.reserve('compact-1', '4750_Yonge_Street', 'attempt-2'),
      repository.reserve('compact-1', '4750_Yonge_Street', 'attempt-3'),
    ]);
    expect([first, second]).toEqual([true, false]);
    expect(table.updateMany).toHaveBeenCalledTimes(2);
    for (const [input] of table.updateMany.mock.calls) {
      expect(input).toMatchObject({
        where: {
          terminalId: 'compact-1',
          attemptId: 'attempt-1',
          state: 'FINALIZED',
        },
        data: { state: 'RESERVED' },
      });
    }
    expect(table.create).not.toHaveBeenCalled();
  });

  it('sends a device cancellation only for the first same-Store SALE_IN_FLIGHT claim', async () => {
    const { repository, table } = setup();
    table.findUnique.mockResolvedValue(initial('SALE_IN_FLIGHT'));
    table.updateMany.mockResolvedValueOnce({ count: 1 });
    const requested = await repository.requestCancel(
      'attempt-1',
      '4750_Yonge_Street',
    );
    expect(requested.requested).toBe(true);
    expect(requested.sendDeviceCancel).toBe(true);
    const calls = table.updateMany.mock.calls as Array<[unknown]>;
    const call = calls[0]?.[0];
    expect(call).toMatchObject({
      where: {
        attemptId: 'attempt-1',
        storeStableId: '4750_Yonge_Street',
        state: 'SALE_IN_FLIGHT',
      },
      data: {
        state: 'CANCEL_REQUESTED',
      },
    });
    const received = call as { data: { cancelRequestedAt: unknown } };
    expect(received.data.cancelRequestedAt).toBeInstanceOf(Date);
    table.findUnique.mockResolvedValueOnce({
      ...initial('CANCEL_REQUESTED'),
      cancelRequestedAt: new Date(),
    });
    const duplicate = await repository.requestCancel(
      'attempt-1',
      '4750_Yonge_Street',
    );
    expect(duplicate.sendDeviceCancel).toBe(false);
    expect(duplicate.requested).toBe(false);
    expect(table.updateMany).toHaveBeenCalledTimes(1);
  });

  it('stores pre-dispatch Cancel without sending a device-scoped command', async () => {
    const { repository, table } = setup();
    table.findUnique.mockResolvedValue(initial('RESERVED'));
    table.updateMany.mockResolvedValue({ count: 1 });
    const result = await repository.requestCancel(
      'attempt-1',
      '4750_Yonge_Street',
    );
    expect(result.requested).toBe(true);
    expect(result.sendDeviceCancel).toBe(false);
  });

  it('fails closed when a different Store tries to cancel a device', async () => {
    const { repository, table } = setup();
    table.findUnique.mockResolvedValue(initial('SALE_IN_FLIGHT'));
    const result = await repository.requestCancel('attempt-1', 'other-store');
    expect(result.operation).toBeNull();
    expect(table.updateMany).not.toHaveBeenCalled();
  });

  it('binds payment once before dispatch and retains the durable cancellation state', async () => {
    const { repository, table } = setup();
    table.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.claimDispatch(
        'attempt-1',
        '00000000-0000-4000-8000-000000000001',
        'external-1',
      ),
    ).toBe(true);
    expect(
      await repository.claimDispatch(
        'attempt-1',
        '00000000-0000-4000-8000-000000000001',
        'external-1',
      ),
    ).toBe(false);
    expect(table.updateMany).toHaveBeenCalledWith({
      where: {
        attemptId: 'attempt-1',
        state: 'RESERVED',
        paymentTransactionId: null,
      },
      data: {
        paymentTransactionId: '00000000-0000-4000-8000-000000000001',
        externalPaymentId: 'external-1',
        state: 'SALE_IN_FLIGHT',
      },
    });
  });

  it('does not free an UNKNOWN device operation via an ACK or elapsed timeout', async () => {
    const { repository, table } = setup();
    table.updateMany.mockResolvedValue({ count: 1 });
    await repository.acknowledgeCancel('attempt-1');
    const calls = table.updateMany.mock.calls as Array<[unknown]>;
    const call = calls[0]?.[0];
    expect(call).toMatchObject({
      where: { attemptId: 'attempt-1', state: 'CANCEL_REQUESTED' },
      data: { state: 'CANCEL_ACKED' },
    });
    const received = call as { data: { cancelAcknowledgedAt: unknown } };
    expect(received.data.cancelAcknowledgedAt).toBeInstanceOf(Date);
    expect(table.updateMany).toHaveBeenCalledTimes(1);
  });
});
