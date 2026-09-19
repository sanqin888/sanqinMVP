import { PayrollRemitterType } from './payroll-contracts';
import {
  derivePayrollCraRemittancePeriod,
  PAYROLL_REMITTANCE_POLICY_VERSION,
} from './payroll-remittance-policy';

const derive = (remitterType: PayrollRemitterType, payDate: string) =>
  derivePayrollCraRemittancePeriod({
    remitterType,
    payDate: new Date(payDate + 'T00:00:00.000Z'),
  });

describe('Payroll CRA remittance policy', () => {
  it('uses payday to derive a regular monthly remittance period', () => {
    expect(derive(PayrollRemitterType.REGULAR, '2026-09-18')).toEqual({
      remittancePolicyVersion: PAYROLL_REMITTANCE_POLICY_VERSION,
      remitterType: PayrollRemitterType.REGULAR,
      payDate: '2026-09-18',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-15',
    });
  });

  it('moves a regular due date to the next CRA working day', () => {
    expect(derive(PayrollRemitterType.REGULAR, '2026-07-31').dueDate).toBe(
      '2026-08-17',
    );
  });

  it('derives the calendar quarter and following-month 15th due date', () => {
    expect(derive(PayrollRemitterType.QUARTERLY, '2026-09-18')).toMatchObject({
      periodStart: '2026-07-01',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-15',
    });
  });

  it('derives both Threshold 1 half-month periods', () => {
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_1, '2026-09-10'),
    ).toMatchObject({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-15',
      dueDate: '2026-09-25',
    });

    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_1, '2026-09-18'),
    ).toMatchObject({
      periodStart: '2026-09-16',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-13',
    });
  });

  it('derives all Threshold 2 remittance bands from payday', () => {
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_2, '2026-09-07'),
    ).toMatchObject({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-07',
      dueDate: '2026-09-10',
    });
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_2, '2026-09-10'),
    ).toMatchObject({
      periodStart: '2026-09-08',
      periodEnd: '2026-09-14',
      dueDate: '2026-09-17',
    });
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_2, '2026-09-18'),
    ).toMatchObject({
      periodStart: '2026-09-15',
      periodEnd: '2026-09-21',
      dueDate: '2026-09-24',
    });
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_2, '2026-09-29'),
    ).toMatchObject({
      periodStart: '2026-09-22',
      periodEnd: '2026-09-30',
      dueDate: '2026-10-05',
    });
  });

  it('counts the third CRA working day across the 2026 year boundary', () => {
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_2, '2026-12-31'),
    ).toMatchObject({
      periodStart: '2026-12-22',
      periodEnd: '2026-12-31',
      dueDate: '2027-01-06',
    });
  });

  it('handles year-end Threshold 1 and quarterly carryover due dates', () => {
    expect(
      derive(PayrollRemitterType.ACCELERATED_THRESHOLD_1, '2026-12-31').dueDate,
    ).toBe('2027-01-11');
    expect(derive(PayrollRemitterType.QUARTERLY, '2026-12-31').dueDate).toBe(
      '2027-01-15',
    );
  });

  it('fails closed outside the reviewed 2026 remittance policy', () => {
    expect(() => derive(PayrollRemitterType.REGULAR, '2027-01-01')).toThrow(
      'supports only 2026 pay dates',
    );
  });

  it('rejects invalid pay dates', () => {
    expect(() =>
      derivePayrollCraRemittancePeriod({
        remitterType: PayrollRemitterType.REGULAR,
        payDate: new Date('invalid'),
      }),
    ).toThrow('payDate must be valid');
  });
});
