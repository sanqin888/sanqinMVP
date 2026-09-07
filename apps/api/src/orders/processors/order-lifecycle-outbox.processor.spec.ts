import { OrderLifecycleOutboxProcessor } from './order-lifecycle-outbox.processor';

type RawTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

const sqlText = (strings: TemplateStringsArray) => strings.join('?');

const lifecycleEvent = (id: string) => ({
  id: `event-${id}`,
  orderId: `order-${id}`,
  orderStableId: `stable-${id}`,
});

describe('OrderLifecycleOutboxProcessor durable lifecycle replay', () => {
  function processorWith(input: {
    queryRaw: jest.MockedFunction<RawTag>;
    fulfillment?: jest.Mock;
    cancellation?: jest.Mock;
    activateImmediate?: jest.Mock;
  }) {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = jest.fn(
      (
        work: (tx: {
          $queryRaw: RawTag;
          opsEvent: { createMany: jest.Mock };
        }) => Promise<unknown>,
      ) =>
        work({
          $queryRaw: input.queryRaw,
          opsEvent: { createMany },
        }),
    );
    const processor = new OrderLifecycleOutboxProcessor(
      { $transaction: transaction } as never,
      {
        handleAcceptedLifecycle:
          input.fulfillment ??
          jest.fn().mockResolvedValue({ jobId: 'print-job-default' }),
        handleCancellationLifecycle:
          input.cancellation ??
          jest.fn().mockResolvedValue({ jobId: 'cancel-job-default' }),
      } as never,
      {
        activateAcceptedImmediateOrder: input.activateImmediate ?? jest.fn(),
      } as never,
    );
    return { processor, transaction, createMany };
  }

  it('checkpoints prep_started only after the Print handoff succeeds', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([lifecycleEvent('a')]);
    const fulfillment = jest.fn().mockResolvedValue({ jobId: 'print-job-a' });
    const { processor, createMany } = processorWith({ queryRaw, fulfillment });

    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(fulfillment).toHaveBeenCalledWith({
      orderId: 'order-a',
    });
    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('FOR UPDATE OF event SKIP LOCKED');
    expect(statement).toContain('NOT EXISTS');
    expect(statement).toContain('FROM "OpsEvent" handoff');
    expect(statement).not.toContain('PosPrintJob');
    expect(queryRaw.mock.calls[0]).toContain('orders.lifecycle');
    expect(queryRaw.mock.calls[0]).toContain('order.prep_started');
    expect(queryRaw.mock.calls[0]).toContain('order.initial_print_handoff');
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.initial_print_handoff:stable-a',
        eventName: 'order.initial_print_handoff',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'stable-a' },
      },
      skipDuplicates: true,
    });
  });

  it('turns an accepted immediate order into prep_started before printing', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([lifecycleEvent('immediate')]);
    const fulfillment = jest.fn();
    const activateImmediate = jest.fn().mockResolvedValue({
      outcome: 'activated',
    });
    const { processor } = processorWith({
      queryRaw,
      fulfillment,
      activateImmediate,
    });

    await expect(processor.processOnce(1)).resolves.toBe(1);
    expect(activateImmediate).toHaveBeenCalledWith('order-immediate');
    expect(fulfillment).not.toHaveBeenCalled();
    const acceptedStatement = sqlText(queryRaw.mock.calls[2][0]);
    expect(acceptedStatement).toContain("'IMMEDIATE'");
    expect(queryRaw.mock.calls[2]).toContain('order.prep_started');
    expect(queryRaw.mock.calls[2]).toContain('order.accepted');
  });

  it('never claims scheduled accepted orders in the immediate lifecycle stage', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activateImmediate = jest.fn();
    const { processor } = processorWith({ queryRaw, activateImmediate });

    await expect(processor.processOnce(1)).resolves.toBe(0);
    expect(activateImmediate).not.toHaveBeenCalled();
    const statement = sqlText(queryRaw.mock.calls[2][0]);
    expect(statement).toContain(
      'orders."fulfillmentTiming" = \'IMMEDIATE\'::"OrderFulfillmentTiming"',
    );
  });

  it('hands confirmed cancellations to Print only after the initial print handoff exists', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...lifecycleEvent('cancelled'),
          reason: 'UBER_ORDER_FAILURE',
          operatorName: 'Uber Eats',
        },
      ]);
    const cancellation = jest.fn().mockResolvedValue({ jobId: 'cancel-job-1' });
    const { processor, createMany } = processorWith({
      queryRaw,
      cancellation,
    });

    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(cancellation).toHaveBeenCalledWith({
      orderStableId: 'stable-cancelled',
      reason: 'UBER_ORDER_FAILURE',
      operatorName: 'Uber Eats',
    });
    const statement = sqlText(queryRaw.mock.calls[1][0]);
    expect(statement).toContain('AND EXISTS');
    expect(statement).toContain('AND NOT EXISTS');
    expect(statement).toContain("orders.status = 'refunded'");
    expect(queryRaw.mock.calls[1]).toContain('order.cancelled');
    expect(queryRaw.mock.calls[1]).toContain('order.initial_print_handoff');
    expect(queryRaw.mock.calls[1]).toContain(
      'order.cancellation_print_handoff',
    );
    expect(createMany).toHaveBeenCalledWith({
      data: {
        idempotencyKey: 'order.cancellation_print_handoff:stable-cancelled',
        eventName: 'order.cancellation_print_handoff',
        source: 'orders.lifecycle',
        payload: { orderStableId: 'stable-cancelled' },
      },
      skipDuplicates: true,
    });
  });

  it('replays prep_started after a worker crash or transient fulfillment failure', async () => {
    const event = lifecycleEvent('replay');
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([event]);
    const fulfillment = jest
      .fn()
      .mockRejectedValueOnce(new Error('process crashed before handoff'))
      .mockResolvedValueOnce({ jobId: 'print-job-replay' });
    const { processor, transaction } = processorWith({
      queryRaw,
      fulfillment,
    });

    await expect(processor.processOnce(1)).rejects.toThrow(
      'process crashed before handoff',
    );
    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(fulfillment).toHaveBeenCalledTimes(2);
  });

  it('requestDrain eagerly wakes the same durable consumer after producer commit', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([]);
    const { processor } = processorWith({ queryRaw });
    const processOnce = jest
      .spyOn(processor, 'processOnce')
      .mockResolvedValue(0);

    processor.requestDrain();
    await Promise.resolve();
    await Promise.resolve();

    expect(processOnce).toHaveBeenCalledTimes(1);
  });

  it('stops when every prep_started event already has its durable AUTO print materialization', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const fulfillment = jest.fn();
    const { processor } = processorWith({ queryRaw, fulfillment });

    await expect(processor.processOnce(25)).resolves.toBe(0);
    expect(fulfillment).not.toHaveBeenCalled();
  });
});
