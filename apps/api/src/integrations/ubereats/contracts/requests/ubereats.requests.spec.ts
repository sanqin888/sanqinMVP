import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateUberOpsTicketDto,
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
});
