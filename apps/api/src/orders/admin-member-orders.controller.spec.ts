import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CustomerExistenceReaderPort } from '../membership/public-api';
import { AdminMemberOrdersController } from './admin-member-orders.controller';
import type { AdminMemberOrdersReadService } from './admin-member-orders-read.service';

describe('AdminMemberOrdersController', () => {
  const createController = (exists: boolean) => {
    const ordersRead = {
      listOrders: jest.fn().mockResolvedValue({ orders: [] }),
      listTopPurchasedItems: jest.fn().mockResolvedValue({ items: [] }),
    };
    const customerExistence: CustomerExistenceReaderPort = {
      customerExists: jest.fn().mockResolvedValue(exists),
    };
    return {
      controller: new AdminMemberOrdersController(
        ordersRead as unknown as AdminMemberOrdersReadService,
        customerExistence,
      ),
      ordersRead,
      customerExistence,
    };
  };

  it('preserves member-not-found semantics before reading Orders', async () => {
    const { controller, ordersRead } = createController(false);

    await expect(controller.listOrders('missing-member', '50')).rejects.toThrow(
      new NotFoundException('member not found'),
    );
    expect(ordersRead.listOrders).not.toHaveBeenCalled();
  });

  it('preserves blank stable-id validation', async () => {
    const { controller, customerExistence } = createController(true);

    await expect(controller.listOrders('   ', '50')).rejects.toThrow(
      new BadRequestException('userStableId is required'),
    );
    expect(customerExistence.customerExists).not.toHaveBeenCalled();
  });

  it('delegates valid stable identity and limit without DB UUID translation', async () => {
    const { controller, ordersRead, customerExistence } = createController(true);

    await controller.listTopPurchasedItems(' user-stable-1 ', '10');

    expect(customerExistence.customerExists).toHaveBeenCalledWith('user-stable-1');
    expect(ordersRead.listTopPurchasedItems).toHaveBeenCalledWith(
      'user-stable-1',
      '10',
    );
  });
});
