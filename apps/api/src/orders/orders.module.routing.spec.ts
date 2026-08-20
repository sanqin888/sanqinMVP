import { MODULE_METADATA } from '@nestjs/common/constants';
import { OrdersController } from './orders.controller';
import { OrdersModule } from './orders.module';
import { ScheduledOrdersController } from './scheduled-orders.controller';

describe('OrdersModule route registration', () => {
  it('registers static scheduled routes before the generic stableId route', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      OrdersModule,
    ) as unknown[];

    expect(controllers.indexOf(ScheduledOrdersController)).toBeGreaterThanOrEqual(0);
    expect(controllers.indexOf(OrdersController)).toBeGreaterThanOrEqual(0);
    expect(controllers.indexOf(ScheduledOrdersController)).toBeLessThan(
      controllers.indexOf(OrdersController),
    );
  });
});