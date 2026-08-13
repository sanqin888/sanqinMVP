import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateUberOpsTicketDto,
  ReportListQuery,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from './operations.requests';

describe('Uber Eats operations request contracts', () => {
  it('publishes stable operations values without leaking persistence enums', () => {
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

  it('requires context matching the ticket type', () => {
    const dto = plainToInstance(CreateUberOpsTicketDto, {
      type: UberOpsTicketType.ORDER_STATUS_SYNC,
      title: 'sync',
    });
    expect(validateSync(dto).map((error) => error.property)).toContain('type');
  });
});
