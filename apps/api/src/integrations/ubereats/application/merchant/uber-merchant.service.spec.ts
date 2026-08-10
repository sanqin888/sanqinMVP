jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats' },
  FulfillmentType: { pickup: 'pickup', delivery: 'delivery' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
  UberMenuPublishStatus: {
    SUBMITTED: 'SUBMITTED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  },
  UberOpsTicketPriority: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
  UberOpsTicketStatus: {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
  },
  UberOpsTicketType: { STORE_STATUS_SYNC: 'STORE_STATUS_SYNC' },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
}));

import { UberConfigService } from '../../infrastructure/config/uber-config.service';
import { UberMerchantService } from './uber-merchant.service';
import { createUberMerchantService } from '../../uber-service-test.helpers';

describe('UberMerchantService 最小依赖装配', () => {
  it('构造函数只声明四个内部能力服务', () => {
    expect(UberMerchantService.length).toBe(4);
  });
  it('OAuth 能力缺少 state 密钥时在构造边界快速失败，但不要求 webhook 密钥', () => {
    const valid = new UberConfigService({
      UBER_EATS_OAUTH_STATE_SECRET: '0123456789abcdef0123456789ABCDEF',
    });
    expect(() =>
      createUberMerchantService({} as never, {} as never, undefined, valid),
    ).not.toThrow();
    expect(() =>
      createUberMerchantService(
        {} as never,
        {} as never,
        undefined,
        new UberConfigService(),
      ),
    ).toThrow('UBER_EATS_OAUTH_STATE_SECRET');
  });
});
