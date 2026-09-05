import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CustomerExistenceReaderPort } from '../membership/public-api';
import { AdminMemberOrdersController } from './admin-member-orders.controller';
import type { AdminMemberOrdersReadService } from './admin-member-orders-read.service';

describe('AdminMemberOrdersController', () => {
  const createController = (exists: boolean) => {
    const listOrders = jest.fn().mockResolvedValue({ orders: [] });
    const listTopPurchasedItems = jest.fn().mockResolvedValue({ items: [] });
    const customerExists = jest.fn().mockResolvedValue(exists);
    const ordersRead = { listOrders, listTopPurchasedItems };
    const customerExistence: CustomerExistenceReaderPort = { customerExists };
    return {
      controller: new AdminMemberOrdersController(
        ordersRead as unknown as AdminMemberOrdersReadService,
        customerExistence,
      ),
      listOrders,
      listTopPurchasedItems,
      customerExists,
    };
  };

  it('preserves member-not-found semantics before reading Orders', async () => {
    const { controller, listOrders } = createController(false);

    await expect(controller.listOrders('missing-member', '50')).rejects.toThrow(
      new NotFoundException('member not found'),
    );
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('preserves blank stable-id validation', async () => {
    const { controller, customerExists } = createController(true);

    await expect(controller.listOrders('   ', '50')).rejects.toThrow(
      new BadRequestException('userStableId is required'),
    );
    expect(customerExists).not.toHaveBeenCalled();
  });

  it('delegates valid stable identity and limit without DB UUID translation', async () => {
    const { controller, listTopPurchasedItems, customerExists } =
      createController(true);

    await controller.listTopPurchasedItems(' user-stable-1 ', '10');

    expect(customerExists).toHaveBeenCalledWith('user-stable-1');
    expect(listTopPurchasedItems).toHaveBeenCalledWith('user-stable-1', '10');
  });
});
