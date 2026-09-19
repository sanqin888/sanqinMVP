import {
  AccountingAccountClass,
  AccountingAccountType,
} from '../accounting-contracts';
import { buildPayrollCraRemittancePreview } from './payroll-cra-remittance-evidence';
import { AccountingPayrollCraRemittanceService } from './accounting-payroll-cra-remittance.service';
import { PayrollRemitterType, PayrollRunStatus } from './payroll-contracts';
import { PAYROLL_ACCOUNT_IDS } from './payroll-journal-write-authority';

const frozenRun = (overrides: Record<string, unknown> = {}) => ({
  runStableId: 'run_regular',
  status: PayrollRunStatus.POSTED,
  payDate: new Date('2026-09-18T00:00:00.000Z'),
  employerConfigStableId: 'config_regular',
  calculationHash: 'sha256:' + 'a'.repeat(64),
  postedJournalEntryStableId: 'journal_run_regular',
  postedAt: new Date('2026-09-18T12:00:00.000Z'),
  incomeTaxCents: 20_000,
  employeeCppCents: 8_000,
  employeeCpp2Cents: 1_000,
  employerCppCents: 8_000,
  employerCpp2Cents: 1_000,
  employeeEiCents: 3_000,
  employerEiCents: 4_200,
  craRemittanceCents: 45_200,
  employerConfig: {
    configStableId: 'config_regular',
    remitterType: PayrollRemitterType.REGULAR,
  },
  ...overrides,
});

const canonicalPreview = () =>
  buildPayrollCraRemittancePreview({
    employerStableId: 'employer_sanq',
    remitterType: PayrollRemitterType.REGULAR,
    remittancePolicyVersion: 'CA-CRA-REMIT-2026-V1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    dueDate: '2026-10-15',
    includedRuns: [
      {
        runStableId: 'run_regular',
        employerConfigStableId: 'config_regular',
        calculationHash: 'sha256:' + 'a'.repeat(64),
        postedAccrualJournalEntryStableId: 'journal_run_regular',
        payDate: '2026-09-18',
        incomeTaxCents: 20_000,
        employeeCppCents: 8_000,
        employeeCpp2Cents: 1_000,
        employerCppCents: 8_000,
        employerCpp2Cents: 1_000,
        employeeEiCents: 3_000,
        employerEiCents: 4_200,
        craRemittanceCents: 45_200,
      },
    ],
  });

const remittanceRow = (journalEntryStableId: string | null) => {
  const preview = canonicalPreview();
  return {
    id: '22222222-2222-4222-8222-222222222222',
    remittanceStableId: 'cra_remittance_1',
    remitterType: preview.remitterType,
    remittancePolicyVersion: preview.remittancePolicyVersion,
    periodStart: new Date(preview.periodStart + 'T00:00:00.000Z'),
    periodEnd: new Date(preview.periodEnd + 'T00:00:00.000Z'),
    dueDate: new Date(preview.dueDate + 'T00:00:00.000Z'),
    incomeTaxCents: preview.incomeTaxCents,
    employeeCppCents: preview.employeeCppCents,
    employeeCpp2Cents: preview.employeeCpp2Cents,
    employerCppCents: preview.employerCppCents,
    employerCpp2Cents: preview.employerCpp2Cents,
    employeeEiCents: preview.employeeEiCents,
    employerEiCents: preview.employerEiCents,
    totalAmountCents: preview.totalAmountCents,
    currency: 'CAD',
    evidenceHash: preview.evidenceHash,
    paymentAccountStableId: 'account_primary_bank',
    paymentDate: new Date('2026-10-20T00:00:00.000Z'),
    reference: 'PD7A',
    journalEntryStableId,
    createdByActorRef: 'actor_remit',
    createdAt: new Date('2026-10-20T12:00:00.000Z'),
    employer: { employerStableId: 'employer_sanq' },
    runs: preview.includedRuns.map((run) => ({
      employerConfigStableId: run.employerConfigStableId,
      calculationHash: run.calculationHash,
      postedAccrualJournalEntryStableId: run.postedAccrualJournalEntryStableId,
      payDate: new Date(run.payDate + 'T00:00:00.000Z'),
      incomeTaxCents: run.incomeTaxCents,
      employeeCppCents: run.employeeCppCents,
      employeeCpp2Cents: run.employeeCpp2Cents,
      employerCppCents: run.employerCppCents,
      employerCpp2Cents: run.employerCpp2Cents,
      employeeEiCents: run.employeeEiCents,
      employerEiCents: run.employerEiCents,
      craRemittanceCents: run.craRemittanceCents,
      run: { runStableId: run.runStableId },
    })),
  };
};

const setup = (runs = [frozenRun()]) => {
  const created = remittanceRow(null);
  const updated = remittanceRow('journal_cra_remittance_1');
  const tx = {
    payrollEmployer: {
      findUnique: jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        employerStableId: 'employer_sanq',
      }),
    },
    payrollEmployerConfigVersion: {
      findFirst: jest.fn().mockResolvedValue({
        configStableId: 'config_regular',
        remitterType: PayrollRemitterType.REGULAR,
      }),
    },
    payrollRun: {
      findMany: jest.fn().mockResolvedValue(runs),
    },
    payrollCraRemittance: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue(updated),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue([
        {
          accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
          accountClass: AccountingAccountClass.LIABILITY,
          type: null,
          currency: 'CAD',
          isActive: true,
        },
        {
          accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
          accountClass: AccountingAccountClass.LIABILITY,
          type: null,
          currency: 'CAD',
          isActive: true,
        },
        {
          accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
          accountClass: AccountingAccountClass.LIABILITY,
          type: null,
          currency: 'CAD',
          isActive: true,
        },
        {
          accountStableId: 'account_primary_bank',
          accountClass: AccountingAccountClass.ASSET,
          type: AccountingAccountType.BANK,
          currency: 'CAD',
          isActive: true,
        },
      ]),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest
      .fn()
      .mockImplementation(
        (work: (client: typeof tx) => Promise<unknown>): Promise<unknown> =>
          work(tx),
      ),
  };
  const journal = {
    createPayrollCraRemittanceJournalInTx: jest.fn().mockResolvedValue({
      entryStableId: 'journal_cra_remittance_1',
    }),
  };
  return {
    prisma,
    tx,
    journal,
    service: new AccountingPayrollCraRemittanceService(
      prisma as never,
      journal as never,
    ),
  };
};

describe('AccountingPayrollCraRemittanceService', () => {
  it('builds an employer-level preview only from unremitted POSTED runs in the frozen remitter period', async () => {
    const otherType = frozenRun({
      runStableId: 'run_threshold',
      employerConfigStableId: 'config_threshold',
      employerConfig: {
        configStableId: 'config_threshold',
        remitterType: PayrollRemitterType.ACCELERATED_THRESHOLD_1,
      },
    });
    const { service } = setup([frozenRun(), otherType]);

    const result = await service.preview('employer_sanq', '2026-09-18');

    expect(result.periodStart).toBe('2026-09-01');
    expect(result.periodEnd).toBe('2026-09-30');
    expect(result.includedRuns.map((run) => run.runStableId)).toEqual([
      'run_regular',
    ]);
    expect(result.totalAmountCents).toBe(45_200);
  });

  it('returns an empty canonical preview when the period has no eligible runs', async () => {
    const { service } = setup([]);
    const result = await service.preview('employer_sanq', '2026-09-18');

    expect(result.includedRuns).toEqual([]);
    expect(result.totalAmountCents).toBe(0);
    expect(result.evidenceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('fails closed when a POSTED candidate is missing frozen accrual evidence', async () => {
    const { service } = setup([
      frozenRun({ postedJournalEntryStableId: null }),
    ]);

    await expect(
      service.preview('employer_sanq', '2026-09-18'),
    ).rejects.toThrow('missing frozen CRA remittance evidence');
  });

  it('posts the server-authoritative preview and freezes settlement evidence atomically', async () => {
    const { service, tx, journal } = setup();
    const preview = canonicalPreview();

    const result = await service.settle(
      'employer_sanq',
      {
        anchorDate: '2026-09-18',
        expectedEvidenceHash: preview.evidenceHash,
        paymentAccountStableId: 'account_primary_bank',
        paymentDate: '2026-10-20',
        reference: 'PD7A',
      },
      'actor_remit',
    );

    expect(result.totalAmountCents).toBe(45_200);
    expect(result.journalEntryStableId).toBe('journal_cra_remittance_1');
    expect(tx.payrollCraRemittance.create).toHaveBeenCalledTimes(1);
    expect(journal.createPayrollCraRemittanceJournalInTx).toHaveBeenCalledTimes(
      1,
    );
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects settlement when the preview hash changed', async () => {
    const { service, tx } = setup();

    await expect(
      service.settle(
        'employer_sanq',
        {
          anchorDate: '2026-09-18',
          expectedEvidenceHash: 'sha256:' + 'b'.repeat(64),
          paymentAccountStableId: 'account_primary_bank',
          paymentDate: '2026-10-20',
        },
        'actor_remit',
      ),
    ).rejects.toThrow(
      'CRA remittance preview changed; refresh and review before posting',
    );
    expect(tx.payrollCraRemittance.create).not.toHaveBeenCalled();
  });

  it('rejects a payment date before the latest included Payroll pay date', async () => {
    const { service, tx } = setup();
    const preview = canonicalPreview();

    await expect(
      service.settle(
        'employer_sanq',
        {
          anchorDate: '2026-09-18',
          expectedEvidenceHash: preview.evidenceHash,
          paymentAccountStableId: 'account_primary_bank',
          paymentDate: '2026-09-17',
        },
        'actor_remit',
      ),
    ).rejects.toThrow(
      'CRA remittance payment date cannot be before the latest included Payroll pay date',
    );
    expect(tx.payrollCraRemittance.create).not.toHaveBeenCalled();
  });

  it('returns an identical completed settlement on evidence-hash replay', async () => {
    const { service, tx, journal } = setup();
    const existing = remittanceRow('journal_cra_remittance_1');
    tx.payrollCraRemittance.findUnique.mockResolvedValue(existing);

    const result = await service.settle(
      'employer_sanq',
      {
        anchorDate: '2026-09-18',
        expectedEvidenceHash: existing.evidenceHash,
        paymentAccountStableId: 'account_primary_bank',
        paymentDate: '2026-10-20',
        reference: 'PD7A',
      },
      'actor_remit',
    );

    expect(result.remittanceStableId).toBe('cra_remittance_1');
    expect(tx.payrollCraRemittance.create).not.toHaveBeenCalled();
    expect(
      journal.createPayrollCraRemittanceJournalInTx,
    ).not.toHaveBeenCalled();
  });

  it('lists existing settlements for the resolved remittance period', async () => {
    const { service, tx } = setup();
    tx.payrollCraRemittance.findMany.mockResolvedValue([
      remittanceRow('journal_cra_remittance_1'),
    ]);

    const result = await service.listForPeriod('employer_sanq', '2026-09-18');

    expect(result).toHaveLength(1);
    expect(result[0]?.remittanceStableId).toBe('cra_remittance_1');
    expect(result[0]?.includedRuns[0]?.runStableId).toBe('run_regular');
  });
});
