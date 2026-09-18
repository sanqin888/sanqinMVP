import { AccountingPayrollOpeningService } from './accounting-payroll-opening.service';

const openingInput = {
  asOfDate: '2026-06-30',
  grossEarningsYtdCents: 1_000_000,
  netPayYtdCents: 800_000,
  periodicEarningsYtdCents: 900_000,
  nonPeriodicEarningsYtdCents: 100_000,
  pensionableEarningsYtdCents: 1_000_000,
  employeeCppYtdCents: 50_000,
  employeeCpp2YtdCents: 0,
  insurableEarningsYtdCents: 1_000_000,
  employeeEiYtdCents: 20_000,
  incomeTaxYtdCents: 130_000,
  nonPeriodicCppBaseContributionYtdCents: 2_000,
  nonPeriodicCppAdditionalDeductionYtdCents: 500,
  nonPeriodicEiPremiumYtdCents: 600,
  vacationPayPaidYtdCents: 40_000,
  vacationPayAccruedYtdCents: 0,
  sourceNote: 'same-employer opening evidence',
};

describe('Accounting Payroll year opening lifecycle', () => {
  it('remains frozen after a run has ever reached approval, including later VOID', async () => {
    const tx = {
      payrollEmployee: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employee-db-id' }),
      },
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue({
          runStableId: 'voided-run-that-was-approved',
        }),
      },
      payrollEmployeeYearOpening: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      accountingAuditLog: { create: jest.fn() },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(
        (work: (client: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const service = new AccountingPayrollOpeningService(prisma as never);

    await expect(
      service.upsertYearOpening(
        'employee_stable_1',
        2026,
        openingInput,
        'actor_1',
      ),
    ).rejects.toThrow(
      'year opening is frozen after the first approved payroll run',
    );

    expect(tx.payrollRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approvedAt: { not: null },
        }) as unknown,
      }),
    );
    expect(tx.payrollEmployeeYearOpening.update).not.toHaveBeenCalled();
    expect(tx.payrollEmployeeYearOpening.create).not.toHaveBeenCalled();
  });
});
