import { PayrollPayFrequency } from './payroll-contracts';
import { derivePayrollPayPeriodsPerYear } from './payroll-schedule';

describe('Payroll pay schedule', () => {
  it('derives actual weekly and biweekly pay-date counts from the anchor', () => {
    expect(
      derivePayrollPayPeriodsPerYear({
        payFrequency: PayrollPayFrequency.WEEKLY,
        payScheduleAnchorDate: new Date('2026-01-01T00:00:00.000Z'),
        taxYear: 2026,
      }),
    ).toBe(53);
    expect(
      derivePayrollPayPeriodsPerYear({
        payFrequency: PayrollPayFrequency.BIWEEKLY,
        payScheduleAnchorDate: new Date('2026-01-01T00:00:00.000Z'),
        taxYear: 2026,
      }),
    ).toBe(27);
    expect(
      derivePayrollPayPeriodsPerYear({
        payFrequency: PayrollPayFrequency.BIWEEKLY,
        payScheduleAnchorDate: new Date('2026-01-08T00:00:00.000Z'),
        taxYear: 2026,
      }),
    ).toBe(26);
  });

  it('pins semimonthly and monthly counts', () => {
    expect(
      derivePayrollPayPeriodsPerYear({
        payFrequency: PayrollPayFrequency.SEMIMONTHLY,
        payScheduleAnchorDate: new Date('2026-01-15T00:00:00.000Z'),
        taxYear: 2026,
      }),
    ).toBe(24);
    expect(
      derivePayrollPayPeriodsPerYear({
        payFrequency: PayrollPayFrequency.MONTHLY,
        payScheduleAnchorDate: new Date('2026-01-31T00:00:00.000Z'),
        taxYear: 2026,
      }),
    ).toBe(12);
  });
});
