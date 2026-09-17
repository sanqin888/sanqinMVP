import { BadRequestException, ConflictException } from '@nestjs/common';

import { AccountingPeriodService } from './accounting-period.service';

describe('AccountingPeriodService accountingStartDate business boundary', () => {
  const makeService = (accountingStartDate: Date | null) => {
    const prisma = {
      accountingAutomationConfig: {
        findUnique: jest.fn().mockResolvedValue({ accountingStartDate }),
      },
    };
    const brandStoreConfigReader = {
      getConfiguredStoreSnapshot: jest.fn().mockResolvedValue({
        timezone: 'America/Toronto',
      }),
    };
    return new AccountingPeriodService(
      prisma as never,
      brandStoreConfigReader as never,
    );
  };

  it('treats the configured date as Toronto midnight instead of UTC midnight', async () => {
    const service = makeService(new Date('2026-06-01T00:00:00.000Z'));

    await expect(
      service.assertOnOrAfterAccountingStartDate(
        new Date('2026-06-01T03:59:59.999Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertOnOrAfterAccountingStartDate(
        new Date('2026-06-01T04:00:00.000Z'),
      ),
    ).resolves.toBeUndefined();
    await expect(service.clampAccountingFromDate()).resolves.toEqual(
      new Date('2026-06-01T04:00:00.000Z'),
    );
  });

  it('requires an explicit accountingStartDate before canonical financial posting', async () => {
    const service = makeService(null);

    await expect(
      service.requireCanonicalFinancialPostingStartAt(),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
