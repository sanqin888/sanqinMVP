import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LegacyPosOrdersController } from './legacy-pos-orders.controller';

describe('LegacyPosOrdersController compatibility transport', () => {
  const orders = {
    recent: jest.fn(),
    board: jest.fn(),
    getByStableIdForStore: jest.fn(),
    updateStatusForStore: jest.fn(),
    createAmendment: jest.fn(),
    advanceForStore: jest.fn(),
    listUpcomingScheduledForStore: jest.fn(),
    getFulfillmentTimingForStore: jest.fn(),
    activateScheduledPreparation: jest.fn(),
  };
  const controller = new LegacyPosOrdersController(orders as never);
  const request = {
    posDevice: {
      deviceStableId: 'device-1',
      storeStableId: '4750_Yonge_Street',
      name: 'Front POS',
    },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves legacy recent and board store scoping', async () => {
    orders.recent.mockResolvedValue([]);
    orders.board.mockResolvedValue([]);

    await expect(controller.recent(request, 10)).resolves.toEqual([]);
    await expect(
      controller.board(request, 'paid,making', 'web,in_store', 50, 1440),
    ).resolves.toEqual([]);

    expect(orders.recent).toHaveBeenCalledWith('4750_Yonge_Street', 10);
    expect(orders.board).toHaveBeenCalledWith('4750_Yonge_Street', {
      statusIn: ['paid', 'making'],
      channelIn: ['web', 'in_store'],
      limit: 50,
      sinceMinutes: 1440,
    });
  });

  it('preserves the legacy scheduled queue response shape', async () => {
    const scheduled = [{ orderStableId: 'scheduled_1' }];
    orders.listUpcomingScheduledForStore.mockResolvedValue(scheduled);

    await expect(controller.listScheduledOrders(request)).resolves.toEqual({
      orders: scheduled,
    });
  });

  it('preserves scheduled timing not-found behavior', async () => {
    orders.getFulfillmentTimingForStore.mockResolvedValue(null);

    await expect(
      controller.getFulfillmentTiming(request, 'missing_order'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves manual preparation validation and delegation', async () => {
    orders.getFulfillmentTimingForStore.mockResolvedValueOnce({
      orderStableId: 'immediate_1',
      fulfillmentTiming: 'IMMEDIATE',
      status: 'paid',
    });

    await expect(
      controller.startPreparationEarly(request, 'immediate_1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orders.activateScheduledPreparation).not.toHaveBeenCalled();

    orders.getFulfillmentTimingForStore
      .mockResolvedValueOnce({
        orderStableId: 'scheduled_1',
        fulfillmentTiming: 'SCHEDULED',
        status: 'paid',
      })
      .mockResolvedValueOnce({
        orderStableId: 'scheduled_1',
        fulfillmentTiming: 'SCHEDULED',
        status: 'making',
      });

    await expect(
      controller.startPreparationEarly(request, 'scheduled_1'),
    ).resolves.toEqual(
      expect.objectContaining({ orderStableId: 'scheduled_1', status: 'making' }),
    );
    expect(orders.activateScheduledPreparation).toHaveBeenCalledWith(
      'scheduled_1',
      '4750_Yonge_Street',
    );
  });

  it('rejects compatibility calls without authenticated POS store identity', async () => {
    await expect(
      controller.listScheduledOrders({ posDevice: undefined } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
