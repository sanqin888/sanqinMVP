jest.mock(
  '@shared/menu',
  () => ({
    isStableId: jest.fn(),
    normalizeStableId: jest.fn((value: string) => value),
  }),
  { virtual: true },
);

import { FulfillmentProcessor } from './fulfillment.processor';
import { Logger } from '@nestjs/common';

describe('FulfillmentProcessor reprint store routing', () => {
  const originalStoreId = process.env.STORE_ID;

  afterEach(() => {
    if (originalStoreId === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = originalStoreId;
    jest.restoreAllMocks();
  });

  function setup(storeId: string | null) {
    const sendPrintJob = jest.fn().mockResolvedValue({ jobId: 'job-1' });
    const processor = new FulfillmentProcessor(
      {} as never,
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            storeId,
          }),
        },
      } as never,
      {} as never,
      { sendPrintJob } as never,
      {
        getByStableId: jest.fn().mockResolvedValue({ orderNumber: '1001' }),
      } as never,
    );
    return { processor, sendPrintJob };
  }

  it('历史订单缺少 storeId 时使用配置的门店恢复收银小票打印', async () => {
    process.env.STORE_ID = 'configured-store';
    const { processor, sendPrintJob } = setup(null);

    await processor.handleOrderReprint({
      orderStableId: 'stable-1',
      targets: { customer: true, kitchen: false },
    });

    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        orderStableId: 'stable-1',
        storeId: 'configured-store',
        data: expect.objectContaining({
          targets: { customer: true, kitchen: false },
        }) as unknown,
      }),
    );
  });

  it('新订单始终优先使用订单自身的 storeId', async () => {
    process.env.STORE_ID = 'configured-store';
    const { processor, sendPrintJob } = setup('order-store');

    await processor.handleOrderReprint({ orderStableId: 'stable-1' });

    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'order-store' }),
    );
  });
});

describe('FulfillmentProcessor accepted web order printing', () => {
  const originalStoreId = process.env.STORE_ID;

  afterEach(() => {
    if (originalStoreId === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = originalStoreId;
    jest.restoreAllMocks();
  });

  function setupAccepted(storeId: string | null) {
    let acceptedHandler:
      | ((payload: { orderId: string }) => Promise<void>)
      | null = null;
    const events = {
      onOrderPaidVerified: jest.fn(),
      onOrderAccepted: jest.fn(
        (handler: (payload: { orderId: string }) => Promise<void>) => {
          acceptedHandler = handler;
        },
      ),
    };
    const sendPrintJob = jest.fn().mockResolvedValue({ jobId: 'auto-job-1' });
    const getByStableId = jest
      .fn()
      .mockResolvedValue({ orderNumber: 'SQ2608110001' });
    const processor = new FulfillmentProcessor(
      events as never,
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'web-order-1',
            orderStableId: 'stable-web-1',
            channel: 'web',
            storeId,
          }),
        },
      } as never,
      {} as never,
      { sendPrintJob } as never,
      { getByStableId } as never,
    );
    processor.onModuleInit();

    return {
      runAccepted: async () => {
        if (!acceptedHandler)
          throw new Error('accepted handler not registered');
        await acceptedHandler({ orderId: 'web-order-1' });
      },
      sendPrintJob,
      getByStableId,
    };
  }

  it('web 订单接单后创建 AUTO 任务并同时请求 customer 和 kitchen', async () => {
    const { runAccepted, sendPrintJob, getByStableId } =
      setupAccepted('store-4750');

    await runAccepted();

    expect(getByStableId).toHaveBeenCalledWith('stable-web-1', 'zh');
    expect(sendPrintJob).toHaveBeenCalledWith({
      orderId: 'web-order-1',
      orderStableId: 'stable-web-1',
      storeId: 'store-4750',
      kind: 'AUTO',
      data: {
        orderNumber: 'SQ2608110001',
        targets: { customer: true, kitchen: true },
      },
    });
  });

  it('历史订单缺少门店时记录结构化错误并使用受控配置兼容打印', async () => {
    process.env.STORE_ID = 'configured-store';
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { runAccepted, sendPrintJob } = setupAccepted(null);

    await runAccepted();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'accepted_print_store_missing',
        orderId: 'web-order-1',
        reason: 'STORE_ID_MISSING',
      }),
    );
    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'configured-store',
        kind: 'AUTO',
      }),
    );
  });
});
