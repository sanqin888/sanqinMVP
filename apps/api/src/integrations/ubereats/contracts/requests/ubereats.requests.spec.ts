import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateUberOpsTicketDto,
  OAuthCallbackQuery,
  OrderStatus,
  PublishUberMenuDto,
  ReportListQuery,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from './ubereats.requests';

describe('Uber Eats request contracts', () => {
  it('publishes stable values without leaking persistence enums', () => {
    expect(Object.values(OrderStatus)).toEqual([
      'pending',
      'paid',
      'making',
      'ready',
      'completed',
      'refunded',
    ]);
    expect(Object.values(UberOpsTicketType)).toEqual([
      'ORDER_STATUS_SYNC',
      'MENU_ITEM_AVAILABILITY',
      'STORE_STATUS_SYNC',
      'MENU_PUBLISH',
      'RECONCILIATION',
    ]);
    expect(Object.values(UberOpsTicketStatus)).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
      'IGNORED',
    ]);
    expect(Object.values(UberOpsTicketPriority)).toEqual([
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL',
    ]);
  });
  it('transforms and bounds report limit', () => {
    expect(
      validateSync(plainToInstance(ReportListQuery, { limit: '100' })),
    ).toHaveLength(0);
    expect(
      validateSync(plainToInstance(ReportListQuery, { limit: '101' })),
    ).not.toHaveLength(0);
  });

  it('rejects duplicate or oversized menu exclusions', () => {
    const dto = plainToInstance(PublishUberMenuDto, {
      excludedCategoryIds: ['a', 'a'],
    });
    expect(validateSync(dto)).not.toHaveLength(0);
  });

  it('requires context matching the ticket type', () => {
    const dto = plainToInstance(CreateUberOpsTicketDto, {
      type: UberOpsTicketType.ORDER_STATUS_SYNC,
      title: 'sync',
    });
    expect(validateSync(dto).map((error) => error.property)).toContain('type');
  });

  it.each([
    ['error', 129],
    ['error_description', 1025],
    ['error_uri', 2049],
  ] as const)('限制不可信 OAuth %s 字段长度', (field, length) => {
    const query = plainToInstance(OAuthCallbackQuery, {
      state: 'valid-state',
      [field]: 'x'.repeat(length),
    });
    expect(validateSync(query).some((error) => error.property === field)).toBe(
      true,
    );
  });

  it('接受 OAuth 标准错误响应字段', () => {
    const query = plainToInstance(OAuthCallbackQuery, {
      state: 'valid-state',
      error: 'access_denied',
      error_description: 'The resource owner denied the request',
      error_uri: 'https://developer.example/errors/access-denied',
    });
    expect(validateSync(query)).toEqual([]);
  });
});
