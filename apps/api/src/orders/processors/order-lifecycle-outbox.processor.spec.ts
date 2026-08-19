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
    activateImmediate?: jest.Mock;
  }) {
    const transaction = jest.fn(
      (work: (tx: { $queryRaw: RawTag }) => Promise<unknown>) =>
        work({ $queryRaw: input.queryRaw }),
    );
    const processor = new OrderLifecycleOutboxProcessor(
      { $transaction: transaction } as never,
      {
        handleAcceptedLifecycle: input.fulfillment ?? jest.fn(),
      } as never,
      {
        activateAcceptedImmediateOrder: input.activateImmediate ?? jest.fn(),
      } as never,
    );
    return { processor, transaction };
  }

  it('materializes prep_started exactly once through the existing AUTO print path', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([lifecycleEvent('a')]);
    const fulfillment = jest.fn().mockResolvedValue(undefined);
    const { processor } = processorWith({ queryRaw, fulfillment });

    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(fulfillment).toHaveBeenCalledWith({ orderId: 'order-a' });
    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('FOR UPDATE OF event SKIP LOCKED');
    expect(statement).toContain('NOT EXISTS');
    expect(statement).toContain('FROM "PosPrintJob" job');
    expect(statement).toContain("job.kind = 'AUTO'");
    expect(queryRaw.mock.calls[0]).toContain('orders.lifecycle');
    expect(queryRaw.mock.calls[0]).toContain('order.prep_started');
  });

  it('turns an accepted immediate order into prep_started before printing', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
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
    const acceptedStatement = sqlText(queryRaw.mock.calls[1][0]);
    expect(acceptedStatement).toContain("'IMMEDIATE'");
    expect(queryRaw.mock.calls[1]).toContain('order.prep_started');
    expect(queryRaw.mock.calls[1]).toContain('order.accepted');
  });

  it('never claims scheduled accepted orders in the immediate lifecycle stage', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const activateImmediate = jest.fn();
    const { processor } = processorWith({ queryRaw, activateImmediate });

    await expect(processor.processOnce(1)).resolves.toBe(0);
    expect(activateImmediate).not.toHaveBeenCalled();
    const statement = sqlText(queryRaw.mock.calls[1][0]);
    expect(statement).toContain(
      'orders."fulfillmentTiming" = \'IMMEDIATE\'::"OrderFulfillmentTiming"',
    );
  });

  it('replays prep_started after a worker crash or transient fulfillment failure', async () => {
    const event = lifecycleEvent('replay');
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([event]);
    const fulfillment = jest
      .fn()
      .mockRejectedValueOnce(
        new Error('process crashed before materialization'),
      )
      .mockResolvedValueOnce(undefined);
    const { processor, transaction } = processorWith({
      queryRaw,
      fulfillment,
    });

    await expect(processor.processOnce(1)).rejects.toThrow(
      'process crashed before materialization',
    );
    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(fulfillment).toHaveBeenCalledTimes(2);
  });

  it('stops when every prep_started event already has its durable AUTO print materialization', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const fulfillment = jest.fn();
    const { processor } = processorWith({ queryRaw, fulfillment });

    await expect(processor.processOnce(25)).resolves.toBe(0);
    expect(fulfillment).not.toHaveBeenCalled();
  });
});
