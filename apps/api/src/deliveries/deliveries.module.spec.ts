import { Test } from '@nestjs/testing';

import { DeliveriesModule } from './deliveries.module';
import {
  UBER_DIRECT_DELIVERY_DISPATCHER,
  type UberDirectDeliveryDispatcherPort,
} from './uber-direct-dispatch.contract';

const TEST_UBER_DIRECT_CONSUMER = Symbol('TEST_UBER_DIRECT_CONSUMER');

describe('DeliveriesModule public dispatch capability', () => {
  it('exports the token-backed Uber Direct dispatcher to consumers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DeliveriesModule],
      providers: [
        {
          provide: TEST_UBER_DIRECT_CONSUMER,
          useFactory: (dispatcher: UberDirectDeliveryDispatcherPort) =>
            dispatcher,
          inject: [UBER_DIRECT_DELIVERY_DISPATCHER],
        },
      ],
    }).compile();

    const dispatcher = moduleRef.get<UberDirectDeliveryDispatcherPort>(
      TEST_UBER_DIRECT_CONSUMER,
    );
    expect(typeof dispatcher.createDelivery).toBe('function');

    await moduleRef.close();
  });
});
