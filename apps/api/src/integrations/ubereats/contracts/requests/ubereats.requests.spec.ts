import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UberOpsTicketType } from '@prisma/client';
import {
  CreateUberOpsTicketDto,
  PublishUberMenuDto,
  ReportListQuery,
} from './ubereats.requests';

describe('Uber Eats request contracts', () => {
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
