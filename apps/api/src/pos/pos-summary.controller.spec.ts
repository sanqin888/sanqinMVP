import { PosSummaryController } from './pos-summary.controller';

describe('PosSummaryController print routing', () => {
  const timeMin = '2026-08-31T04:00:00.000Z';
  const timeMax = '2026-09-01T04:00:00.000Z';
  const summary = {
    timeMin,
    timeMax,
    totals: {
      orders: 1,
      salesCents: 1200,
      taxCents: 156,
      discountCents: 0,
      refundCents: 0,
      netCents: 1356,
      deliveryFeeCents: 0,
      deliveryCostCents: 0,
    },
    breakdownByPayment: [],
    breakdownByFulfillment: [],
    breakdownByChannel: [],
    orders: [],
  };

  it('routes summary printing to the authenticated device store stable id', async () => {
    const service = {
      summary: jest.fn().mockResolvedValue(summary),
    };
    const gateway = {
      sendPrintSummary: jest.fn(),
    };
    const controller = new PosSummaryController(
      service as never,
      gateway as never,
    );

    const result = await controller.printSummary(
      {
        posDevice: { storeStableId: '4750_Yonge_Street' },
      } as never,
      timeMin,
      timeMax,
      'payment',
      'pickup',
      'paid',
      'cash',
    );

    expect(service.summary).toHaveBeenCalledWith({
      timeMin,
      timeMax,
      fulfillmentType: 'pickup',
      status: 'paid',
      payment: 'cash',
    });
    expect(gateway.sendPrintSummary).toHaveBeenCalledWith('4750_Yonge_Street', {
      ...summary,
      breakdownType: 'payment',
    });
    expect(result).toEqual({ success: true });
  });

  it('rejects printing when the authenticated POS store identity is unavailable', async () => {
    const service = {
      summary: jest.fn(),
    };
    const gateway = {
      sendPrintSummary: jest.fn(),
    };
    const controller = new PosSummaryController(
      service as never,
      gateway as never,
    );

    await expect(
      controller.printSummary(
        {} as never,
        timeMin,
        timeMax,
        'channel',
        undefined,
        undefined,
        undefined,
      ),
    ).rejects.toThrow('POS device store unavailable');

    expect(service.summary).not.toHaveBeenCalled();
    expect(gateway.sendPrintSummary).not.toHaveBeenCalled();
  });
});
