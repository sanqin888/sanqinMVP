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
    const getLabelPlanByStableId = jest.fn().mockResolvedValue({
      labelWidthMm: 70,
      labelHeightMm: 30,
      labels: [],
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
        getByStableId: jest.fn().mockResolvedValue({
          orderNumber: '1001',
          snapshot: { items: [] },
        }),
      } as never,
      {
        getByStableId: getLabelPlanByStableId,
      } as never,
    );
    return { processor, sendPrintJob, getLabelPlanByStableId };
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
      expect.objectContaining({
        storeStableId: 'order-store',
        purpose: 'REPRINT',
      }),
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

  it('菜品改单只把新增标签差额交给 AMENDMENT，并独立重打完整收银单', async () => {
    const { processor, sendPrintJob, getLabelPlanByStableId } =
      setup('order-store');
    const label = {
      productStableId: 'item-added',
      pairCode: null,
      component: 'main',
      componentNameZh: null,
      componentNameEn: null,
      packagingTypeStableId: 'package-bowl',
      packagingTypeName: 'Bowl',
      nameZh: '新增菜',
      nameEn: 'Added Item',
      options: [],
      specialInstructions: null,
      copies: 1,
    };
    getLabelPlanByStableId.mockResolvedValueOnce({
      labelWidthMm: 70,
      labelHeightMm: 30,
      labels: [{ ...label, copies: 2 }],
    });

    await processor.handleOrderAmendmentPrint({
      orderStableId: 'stable-1',
      reason: '换菜',
      operatorName: 'staff',
      beforeLabelPlan: {
        labelWidthMm: 70,
        labelHeightMm: 30,
        labels: [label],
      },
      printCustomerReceipt: true,
      afterOrderItems: [
        {
          productStableId: 'item-added',
          qty: 1,
          displayName: 'Added Item',
          nameEn: 'Added Item',
          nameZh: '新增菜',
          unitPriceCents: 500,
          specialInstructions: null,
          displayOptions: null,
          components: [
            {
              productStableId: 'component-soup',
              nameEn: 'Soup',
              nameZh: '汤',
              quantity: 2,
              priceDeltaCents: 0,
              source: 'FIXED',
              sourceOptionStableId: null,
              options: [],
            },
          ],
        },
      ],
      items: [
        {
          action: 'ADD' as never,
          productStableId: 'item-added',
          qty: 1,
          unitPriceCents: 500,
          displayName: 'Added Item',
        },
      ],
    });

    expect(sendPrintJob).toHaveBeenCalledTimes(2);
    expect(sendPrintJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        purpose: 'AMENDMENT',
        storeStableId: 'order-store',
        data: expect.objectContaining({
          labelPlan: expect.objectContaining({
            labels: [expect.objectContaining({ copies: 1 })],
          }) as unknown,
          snapshot: expect.objectContaining({
            items: expect.arrayContaining([
              expect.objectContaining({
                productStableId: 'item-added',
                components: [
                  expect.objectContaining({
                    productStableId: 'component-soup',
                    quantity: 2,
                  }),
                ],
              }),
            ]),
          }) as unknown,
        }) as unknown,
      }),
    );
    expect(sendPrintJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        purpose: 'REPRINT',
        requestedTargets: {
          customer: true,
          kitchen: false,
          label: false,
        },
      }),
    );
  });

  it('纯支付方式变化只创建 customer-only REPRINT，不创建厨房改单任务', async () => {
    const { processor, sendPrintJob } = setup('order-store');

    await processor.handleOrderAmendmentPrint({
      orderStableId: 'stable-1',
      reason: '支付方式调整',
      operatorName: 'staff',
      printCustomerReceipt: true,
      items: [],
    });

    expect(sendPrintJob).toHaveBeenCalledTimes(1);
    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'REPRINT',
        requestedTargets: {
          customer: true,
          kitchen: false,
          label: false,
        },
      }),
    );
  });
});

describe('FulfillmentProcessor accepted lifecycle printing', () => {
  const originalStoreId = process.env.STORE_ID;

  afterEach(() => {
    if (originalStoreId === undefined) delete process.env.STORE_ID;
    else process.env.STORE_ID = originalStoreId;
    jest.restoreAllMocks();
  });

  function setupAccepted(storeId: string | null) {
    const sendPrintJob = jest.fn().mockResolvedValue({ jobId: 'auto-job-1' });
    const emitAsync = jest.fn(async (_event: string, input: unknown) => {
      await sendPrintJob(input);
      return [{ jobId: 'auto-job-1' }];
    });
    const getByStableId = jest
      .fn()
      .mockResolvedValue({ orderNumber: 'SQ2608110001' });
    const processor = new FulfillmentProcessor(
      {} as never,
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'web-order-1',
            orderStableId: 'stable-web-1',
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

    return {
      processor,
      sendPrintJob,
      getByStableId,
    };
  }

  it('durable Web prep_started 创建 AUTO 任务并同时请求 customer 和 kitchen', async () => {
    const { processor, sendPrintJob, getByStableId } =
      setupAccepted('store-4750');

    await processor.handleAcceptedLifecycle({
      orderId: 'web-order-1',
    });

    expect(getByStableId).toHaveBeenCalledWith('stable-web-1', 'zh');
    expect(sendPrintJob).toHaveBeenCalledWith({
      orderId: 'web-order-1',
      orderStableId: 'stable-web-1',
      storeStableId: 'store-4750',
      purpose: 'INITIAL',
      data: {
        orderNumber: 'SQ2608110001',
        labelPlan: {
          labelWidthMm: 70,
          labelHeightMm: 30,
          labels: [],
        },
      },
    });
  });

  it('durable POS prep_started 为 in_store 订单创建唯一 AUTO 首次打印', async () => {
    const { processor, sendPrintJob } = setupAccepted('store-4750');

    await processor.handleAcceptedLifecycle({
      orderId: 'web-order-1',
    });

    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'web-order-1',
        orderStableId: 'stable-web-1',
        storeStableId: 'store-4750',
        purpose: 'INITIAL',
      }),
    );
  });

  it('订单缺少 storeId 时记录结构化错误并停止自动打印派发', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { processor, sendPrintJob } = setupAccepted(null);

    await processor.handleAcceptedLifecycle({
      orderId: 'web-order-1',
    });

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
