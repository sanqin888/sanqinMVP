jest.mock(
  '@shared/foundation',
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
    const emitAsync = jest.fn(async (_event: string, input: unknown) => {
      await sendPrintJob(input);
      return [{ jobId: 'job-1' }];
    });
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
      { emitAsync } as never,
      {
        getByStableId: jest.fn().mockResolvedValue({ orderNumber: '1001' }),
      } as never,
      {
        getByStableId: jest.fn().mockResolvedValue({
          labelWidthMm: 70,
          labelHeightMm: 30,
          labels: [],
        }),
      } as never,
    );
    return { processor, sendPrintJob };
  }

  it('订单缺少 storeId 时拒绝猜测门店并停止重打派发', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { processor, sendPrintJob } = setup(null);

    await processor.handleOrderReprint({
      orderStableId: 'stable-1',
      targets: { customer: true, kitchen: false },
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'reprint_store_missing',
        orderStableId: 'stable-1',
        reason: 'STORE_ID_MISSING',
      }),
    );
    expect(sendPrintJob).not.toHaveBeenCalled();
  });

  it('新订单始终使用订单自身的 storeId', async () => {
    process.env.STORE_ID = 'configured-store';
    const { processor, sendPrintJob } = setup('order-store');

    await processor.handleOrderReprint({ orderStableId: 'stable-1' });

    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 'order-store' }),
    );
  });

  it('改单打印缺少 storeId 时停止派发', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { processor, sendPrintJob } = setup(null);

    await processor.handleOrderAmendmentPrint({
      orderStableId: 'stable-1',
      reason: 'test',
      operatorName: 'staff',
      items: [],
    });

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'amendment_print_store_missing',
        orderStableId: 'stable-1',
        reason: 'STORE_ID_MISSING',
      }),
    );
    expect(sendPrintJob).not.toHaveBeenCalled();
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
    const emitAsync = jest.fn(async (_event: string, input: unknown) => {
      await sendPrintJob(input);
      return [{ jobId: 'auto-job-1' }];
    });
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
      { emitAsync } as never,
      { getByStableId } as never,
      {
        getByStableId: jest.fn().mockResolvedValue({
          labelWidthMm: 70,
          labelHeightMm: 30,
          labels: [],
        }),
      } as never,
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
        labelPlan: {
          labelWidthMm: 70,
          labelHeightMm: 30,
          labels: [],
        },
        targets: { customer: true, kitchen: true, label: false },
      },
    });
  });

  it('订单缺少 storeId 时记录结构化错误并停止自动打印派发', async () => {
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
    expect(sendPrintJob).not.toHaveBeenCalled();
  });
});
