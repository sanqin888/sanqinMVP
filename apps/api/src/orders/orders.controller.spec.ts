import type { CreateOrderInput } from '@shared/order';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';

describe('OrdersController member identity boundary', () => {
  const createDto = (userStableId?: string): CreateOrderInput =>
    ({
      channel: 'web',
      fulfillmentType: 'pickup',
      userStableId,
      items: [],
    }) as CreateOrderInput;

  it('ignores a client-supplied userStableId for a guest public order', async () => {
    const ordersService = {
      create: jest.fn().mockResolvedValue(undefined),
      quoteOrderPricing: jest.fn(),
    };
    const controller = new OrdersController(
      ordersService as unknown as OrdersService,
    );
    const req = {} as Parameters<OrdersController['create']>[0];

    await controller.create(req, createDto('forged-member'));

    expect(ordersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ userStableId: undefined }),
    );
  });

  it('uses the authenticated session member identity for public pricing quotes', async () => {
    const ordersService = {
      create: jest.fn(),
      quoteOrderPricing: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new OrdersController(
      ordersService as unknown as OrdersService,
    );
    const req = {
      user: { userStableId: 'session-member' },
    } as Parameters<OrdersController['quotePricing']>[0];

    await controller.quotePricing(req, createDto('forged-member'));

    expect(ordersService.quoteOrderPricing).toHaveBeenCalledWith(
      expect.objectContaining({
        userStableId: 'session-member',
        discountCents: undefined,
      }),
    );
  });
});
