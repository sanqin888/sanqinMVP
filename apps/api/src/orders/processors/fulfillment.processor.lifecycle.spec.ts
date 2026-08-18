jest.mock(
  '@shared/menu',
  () => ({
    isStableId: jest.fn(),
    normalizeStableId: jest.fn((value: string) => value),
  }),
  { virtual: true },
);

import { Logger } from '@nestjs/common';
import { FulfillmentProcessor } from './fulfillment.processor';

describe('FulfillmentProcessor durable accepted lifecycle', () => {
  afterEach(() => jest.restoreAllMocks());

  it('surfaces AUTO print creation failure so the durable consumer can replay it', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendPrintJob = jest
      .fn()
      .mockRejectedValue(new Error('print persistence unavailable'));
    const processor = new FulfillmentProcessor(
      {} as never,
      {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            orderStableId: 'stable-1',
            channel: 'ubereats',
            storeId: '4750_Yonge_Street',
          }),
        },
      } as never,
      {} as never,
      { sendPrintJob } as never,
      {
        getByStableId: jest.fn().mockResolvedValue({ orderNumber: '1001' }),
      } as never,
    );

    await expect(
      processor.handleAcceptedLifecycle({ orderId: 'order-1' }),
    ).rejects.toThrow('print persistence unavailable');

    expect(sendPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        orderStableId: 'stable-1',
        kind: 'AUTO',
      }),
    );
  });
});
