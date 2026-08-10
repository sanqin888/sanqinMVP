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
  PaymentMethod: { UBEREATS: 'UBEREATS' },
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
}));

import { toUberServiceAvailability } from './uber-payload.utils';
import { UberMenuService } from './uber-menu.service';
import { createUberMenuService } from './uber-service-test.helpers';
describe('syncUberMenuItemAvailability', () => {
  beforeEach(() => {
    process.env.UBER_EATS_OAUTH_STATE_SECRET =
      'high-entropy-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    process.env.UBER_EATS_WEBHOOK_SIGNING_KEY = 'test-ubereats-secret';
  });

  afterEach(() => jest.restoreAllMocks());

  function subject(configs: Array<Record<string, unknown>>) {
    const prisma = {
      menuItem: {
        findUnique: jest.fn().mockResolvedValue({ stableId: 'dish-1' }),
      },
      uberItemChannelConfig: {
        findMany: jest.fn().mockResolvedValue(configs),
        update: jest.fn().mockResolvedValue({}),
      },
      uberStoreMapping: {
        findMany: jest.fn().mockResolvedValue([
          { posExternalStoreId: 'pos-1', uberStoreId: 'uber-1' },
          { posExternalStoreId: 'pos-2', uberStoreId: 'uber-2' },
        ]),
      },
      uberOpsTicket: { create: jest.fn().mockResolvedValue({}) },
      opsEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = createUberMenuService(
      prisma as unknown as ConstructorParameters<typeof UberMenuService>[0],
      {} as unknown as ConstructorParameters<typeof UberMenuService>[0],
    );
    return { prisma, service };
  }

  it.each([
    ['当日售罄', false],
    ['永久下架', false],
    ['恢复销售', true],
  ])('%s 会保存状态并提交可靠的菜单发布任务', async (_name, available) => {
    const { prisma, service } = subject([
      { storeId: 'pos-1', uberStoreId: 'uber-1', externalItemId: 'item-1' },
    ]);
    jest.spyOn(service, 'publishUberMenu').mockResolvedValue({
      versionStableId: 'version-1',
    } as unknown as ConstructorParameters<typeof UberMenuService>[0]);

    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: available,
    });

    expect(result.status).toBe('PENDING');
    expect(prisma.uberItemChannelConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isAvailable: available } }),
    );
  });

  it('未配置 Uber 商品时明确跳过，而不使用 default 门店', async () => {
    const { prisma, service } = subject([]);
    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: false,
    });
    expect(result).toEqual({ status: 'SKIPPED_NOT_PUBLISHED', stores: [] });
    expect(prisma.uberItemChannelConfig.findMany).toHaveBeenCalledWith({
      where: { menuItemStableId: 'dish-1' },
    });
  });

  it('上游失败会返回 FAILED 并保留可重试运营工单', async () => {
    const { prisma, service } = subject([
      { storeId: 'pos-1', uberStoreId: 'uber-1', externalItemId: 'item-1' },
    ]);
    jest
      .spyOn(service, 'publishUberMenu')
      .mockRejectedValue(new Error('upstream'));
    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: false,
    });
    expect(result.status).toBe('FAILED');
    expect(prisma.uberOpsTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: 'upstream' }) as unknown,
      }),
    );
  });

  it('多门店会向每个已 provision 的商品映射分别发布', async () => {
    const { service } = subject([
      { storeId: 'pos-1', uberStoreId: 'uber-1', externalItemId: 'item-1' },
      { storeId: 'pos-2', uberStoreId: 'uber-2', externalItemId: 'item-2' },
    ]);
    const publish = jest.spyOn(service, 'publishUberMenu').mockResolvedValue({
      versionStableId: 'version',
    } as unknown as ConstructorParameters<typeof UberMenuService>[0]);
    const result = await service.syncUberMenuItemAvailability({
      menuItemStableId: 'dish-1',
      isAvailable: true,
    });
    expect(result.stores).toHaveLength(2);
    expect(publish).toHaveBeenCalledTimes(2);
  });
});

describe('toUberServiceAvailability', () => {
  const convert = (hours: Parameters<typeof toUberServiceAvailability>[0]) =>
    toUberServiceAvailability(hours, 'America/Toronto');

  it('保留门店时区下的普通本地时段', () => {
    expect(
      convert([
        { weekday: 1, openMinutes: 540, closeMinutes: 1080, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'monday',
        time_periods: [{ start_time: '09:00', end_time: '18:00' }],
      },
    ]);
  });

  it('休息日和空配置不产生可售时段', () => {
    expect(
      convert([
        { weekday: 2, openMinutes: null, closeMinutes: null, isClosed: true },
      ]),
    ).toEqual([]);
    expect(convert([])).toEqual([]);
  });

  it('跨午夜时段拆分至相邻本地日期', () => {
    expect(
      convert([
        { weekday: 6, openMinutes: 1320, closeMinutes: 120, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'sunday',
        time_periods: [{ start_time: '00:00', end_time: '02:00' }],
      },
      {
        day_of_week: 'saturday',
        time_periods: [{ start_time: '22:00', end_time: '24:00' }],
      },
    ]);
  });

  it('同一天保留多个营业区间，并明确表达全天营业', () => {
    expect(
      convert([
        { weekday: 3, openMinutes: 480, closeMinutes: 720, isClosed: false },
        { weekday: 3, openMinutes: 1020, closeMinutes: 1260, isClosed: false },
        { weekday: 4, openMinutes: 0, closeMinutes: 0, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'wednesday',
        time_periods: [
          { start_time: '08:00', end_time: '12:00' },
          { start_time: '17:00', end_time: '21:00' },
        ],
      },
      {
        day_of_week: 'thursday',
        time_periods: [{ start_time: '00:00', end_time: '24:00' }],
      },
    ]);
  });

  it('正确将周日跨午夜时段拆分到下周一', () => {
    expect(
      convert([
        { weekday: 0, openMinutes: 1380, closeMinutes: 60, isClosed: false },
      ]),
    ).toEqual([
      {
        day_of_week: 'sunday',
        time_periods: [{ start_time: '23:00', end_time: '24:00' }],
      },
      {
        day_of_week: 'monday',
        time_periods: [{ start_time: '00:00', end_time: '01:00' }],
      },
    ]);
  });
});
