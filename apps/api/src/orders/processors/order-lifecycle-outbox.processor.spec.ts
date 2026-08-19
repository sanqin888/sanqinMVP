import { OrderLifecycleOutboxProcessor } from './order-lifecycle-outbox.processor';

type RawTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

const sqlText = (strings: TemplateStringsArray) => strings.join('?');

const acceptedEvent = (id: string) => ({
  id: `event-${id}`,
  orderId: `order-${id}`,
  orderStableId: `stable-${id}`,
});

describe('OrderLifecycleOutboxProcessor durable accepted replay', () => {
  function processorWith(
    queryRaw: jest.MockedFunction<RawTag>,
    handleAcceptedLifecycle: jest.Mock,
  ) {
    const transaction = jest.fn(
      (work: (tx: { $queryRaw: RawTag }) => Promise<unknown>) =>
        work({ $queryRaw: queryRaw }),
    );
    const processor = new OrderLifecycleOutboxProcessor(
      { $transaction: transaction } as never,
      { handleAcceptedLifecycle } as never,
    );
    return { processor, transaction };
  }

  it('locks one unmaterialized lifecycle event with SKIP LOCKED for concurrent consumers', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValueOnce([acceptedEvent('a')])
      .mockResolvedValueOnce([acceptedEvent('b')]);
    const firstFulfillment = jest.fn().mockResolvedValue(undefined);
    const secondFulfillment = jest.fn().mockResolvedValue(undefined);
    const first = processorWith(queryRaw, firstFulfillment).processor;
    const second = processorWith(queryRaw, secondFulfillment).processor;

    await expect(
      Promise.all([first.processOnce(1), second.processOnce(1)]),
    ).resolves.toEqual([1, 1]);

    expect(firstFulfillment).toHaveBeenCalledWith({ orderId: 'order-a' });
    expect(secondFulfillment).toHaveBeenCalledWith({ orderId: 'order-b' });
    expect(queryRaw).toHaveBeenCalledTimes(2);
    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('FOR UPDATE OF event SKIP LOCKED');
    expect(statement).toContain('JOIN "Order" orders');
    expect(statement).toContain('orders.id::text = event.payload');
    expect(statement).toContain('orders."orderStableId" = event.payload');
    expect(statement).toContain('NOT EXISTS');
    expect(statement).toContain('FROM "PosPrintJob" job');
    expect(statement).toContain("job.kind = 'AUTO'");
    expect(queryRaw.mock.calls[0]).toContain('orders.lifecycle');
    expect(queryRaw.mock.calls[0]).toContain('order.accepted');
  });

  it('does not let an older orphan event block a newer valid accepted order', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      // The SQL join excludes an older lifecycle event whose Order was deleted,
      // so the first row returned to the processor is the newer valid event.
      .mockResolvedValueOnce([acceptedEvent('valid')])
      .mockResolvedValueOnce([]);
    const fulfillment = jest.fn().mockResolvedValue(undefined);
    const { processor } = processorWith(queryRaw, fulfillment);

    await expect(processor.processOnce(2)).resolves.toBe(1);

    expect(fulfillment).toHaveBeenCalledTimes(1);
    expect(fulfillment).toHaveBeenCalledWith({ orderId: 'order-valid' });
    const statement = sqlText(queryRaw.mock.calls[0][0]);
    expect(statement).toContain('JOIN "Order" orders');
    expect(statement).toContain(
      'ORDER BY event."createdAt" ASC, event.id ASC',
    );
  });

  it('replays the same event after a worker crash or transient fulfillment failure', async () => {
    const event = acceptedEvent('replay');
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
    const { processor, transaction } = processorWith(queryRaw, fulfillment);

    await expect(processor.processOnce(1)).rejects.toThrow(
      'process crashed before materialization',
    );
    await expect(processor.processOnce(1)).resolves.toBe(1);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(fulfillment).toHaveBeenCalledTimes(2);
    expect(fulfillment).toHaveBeenNthCalledWith(1, {
      orderId: 'order-replay',
    });
    expect(fulfillment).toHaveBeenNthCalledWith(2, {
      orderId: 'order-replay',
    });
  });

  it('stops when every accepted event already has its durable AUTO print materialization', async () => {
    const queryRaw = jest
      .fn<ReturnType<RawTag>, Parameters<RawTag>>()
      .mockResolvedValue([]);
    const fulfillment = jest.fn();
    const { processor } = processorWith(queryRaw, fulfillment);

    await expect(processor.processOnce(25)).resolves.toBe(0);
    expect(fulfillment).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
