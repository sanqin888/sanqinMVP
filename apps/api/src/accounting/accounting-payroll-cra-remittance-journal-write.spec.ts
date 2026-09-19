import {
  AccountingAccountClass,
  AccountingAccountType,
  AccountingJournalEntryKind,
  AccountingJournalSource,
} from './accounting-contracts';
import { AccountingJournalService } from './accounting-journal.service';
import { AccountingPeriodService } from './accounting-period.service';
import {
  buildPayrollCraRemittanceWritePlan,
  type PayrollCraRemittanceAccountFact,
  type PayrollCraRemittanceFactV1,
} from './payroll/payroll-cra-remittance-journal-authority';
import { buildPayrollCraRemittancePreview } from './payroll/payroll-cra-remittance-evidence';
import { PAYROLL_ACCOUNT_IDS } from './payroll/payroll-journal-write-authority';
import { PayrollRemitterType } from './payroll/payroll-contracts';

const fact = (): PayrollCraRemittanceFactV1 => {
  const preview = buildPayrollCraRemittancePreview({
    employerStableId: 'employer_sanq',
    remitterType: PayrollRemitterType.REGULAR,
    remittancePolicyVersion: 'CA-CRA-REMIT-2026-V1',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    dueDate: '2026-10-15',
    includedRuns: [
      {
        runStableId: 'payroll_run_1',
        employerConfigStableId: 'config_regular',
        calculationHash: 'sha256:' + 'a'.repeat(64),
        postedAccrualJournalEntryStableId: 'journal_payroll_accrual_1',
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
  return {
    remittanceStableId: 'cra_remittance_1',
    ...preview,
    paymentAccountStableId: 'account_primary_bank',
    paymentDate: '2026-10-20',
  };
};

const accountFacts = (): PayrollCraRemittanceAccountFact[] => [
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.cppPayable,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: PAYROLL_ACCOUNT_IDS.eiPayable,
    accountClass: AccountingAccountClass.LIABILITY,
    accountType: null,
    currency: 'CAD',
    isActive: true,
  },
  {
    accountStableId: 'account_primary_bank',
    accountClass: AccountingAccountClass.ASSET,
    accountType: AccountingAccountType.BANK,
    currency: 'CAD',
    isActive: true,
  },
];

function makeService() {
  const remittanceFact = fact();
  const facts = accountFacts();
  const plan = buildPayrollCraRemittanceWritePlan({
    fact: remittanceFact,
    accountFacts: facts,
  });
  const runEvidence = remittanceFact.includedRuns[0];
  if (!runEvidence) throw new Error('missing CRA remittance run fixture');
  const remittanceAuthority = {
    remitterType: remittanceFact.remitterType,
    remittancePolicyVersion: remittanceFact.remittancePolicyVersion,
    periodStart: new Date(remittanceFact.periodStart + 'T00:00:00.000Z'),
    periodEnd: new Date(remittanceFact.periodEnd + 'T00:00:00.000Z'),
    dueDate: new Date(remittanceFact.dueDate + 'T00:00:00.000Z'),
    incomeTaxCents: remittanceFact.incomeTaxCents,
    employeeCppCents: remittanceFact.employeeCppCents,
    employeeCpp2Cents: remittanceFact.employeeCpp2Cents,
    employerCppCents: remittanceFact.employerCppCents,
    employerCpp2Cents: remittanceFact.employerCpp2Cents,
    employeeEiCents: remittanceFact.employeeEiCents,
    employerEiCents: remittanceFact.employerEiCents,
    totalAmountCents: remittanceFact.totalAmountCents,
    currency: 'CAD',
    evidenceHash: remittanceFact.evidenceHash,
    paymentAccountStableId: remittanceFact.paymentAccountStableId,
    paymentDate: new Date(remittanceFact.paymentDate + 'T00:00:00.000Z'),
    journalEntryStableId: null,
    employer: { employerStableId: remittanceFact.employerStableId },
    runs: [
      {
        employerConfigStableId: runEvidence.employerConfigStableId,
        calculationHash: runEvidence.calculationHash,
        postedAccrualJournalEntryStableId:
          runEvidence.postedAccrualJournalEntryStableId,
        payDate: new Date(runEvidence.payDate + 'T00:00:00.000Z'),
        incomeTaxCents: runEvidence.incomeTaxCents,
        employeeCppCents: runEvidence.employeeCppCents,
        employeeCpp2Cents: runEvidence.employeeCpp2Cents,
        employerCppCents: runEvidence.employerCppCents,
        employerCpp2Cents: runEvidence.employerCpp2Cents,
        employeeEiCents: runEvidence.employeeEiCents,
        employerEiCents: runEvidence.employerEiCents,
        craRemittanceCents: runEvidence.craRemittanceCents,
        run: {
          runStableId: runEvidence.runStableId,
          status: 'POSTED',
          employerConfigStableId: runEvidence.employerConfigStableId,
          calculationHash: runEvidence.calculationHash,
          postedJournalEntryStableId:
            runEvidence.postedAccrualJournalEntryStableId,
          postedAt: new Date('2026-09-18T14:00:00.000Z'),
          payDate: new Date(runEvidence.payDate + 'T00:00:00.000Z'),
          incomeTaxCents: runEvidence.incomeTaxCents,
          employeeCppCents: runEvidence.employeeCppCents,
          employeeCpp2Cents: runEvidence.employeeCpp2Cents,
          employerCppCents: runEvidence.employerCppCents,
          employerCpp2Cents: runEvidence.employerCpp2Cents,
          employeeEiCents: runEvidence.employeeEiCents,
          employerEiCents: runEvidence.employerEiCents,
          craRemittanceCents: runEvidence.craRemittanceCents,
        },
      },
    ],
  };
  const accountRows = facts.map((account, index) => ({
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '0')}`,
    accountStableId: account.accountStableId,
    accountClass: account.accountClass,
    type: account.accountType,
    currency: account.currency,
    isActive: account.isActive,
  }));
  const tx = {
    payrollCraRemittance: {
      findUnique: jest.fn().mockResolvedValue(remittanceAuthority),
    },
    accountingAccount: {
      findMany: jest.fn().mockResolvedValue(accountRows),
    },
    accountingJournalEntry: {
      findMany: jest.fn().mockResolvedValue([
        {
          entryStableId: runEvidence.postedAccrualJournalEntryStableId,
          source: AccountingJournalSource.PAYROLL,
          sourceFactType: 'payroll.run.accrual.v1',
          sourceFactStableId: runEvidence.runStableId,
          deletedAt: null,
        },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        entryStableId: 'journal_cra_remittance_1',
        idempotencyKey: 'payroll-cra-remittance:cra_remittance_1:v1',
        kind: AccountingJournalEntryKind.STANDARD,
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.cra_remittance.v1',
        sourceFactStableId: 'cra_remittance_1',
        sourceFactVersion: 1,
        storeStableId: null,
        occurredAt: new Date('2026-10-20T00:00:00.000Z'),
        currency: 'CAD',
        memo: 'Payroll CRA remittance 2026-09-01 to 2026-09-30',
        createdByActorRef: 'actor_remit',
        updatedByActorRef: 'actor_remit',
        createdAt: new Date('2026-10-20T14:00:00.000Z'),
        updatedAt: new Date('2026-10-20T14:00:00.000Z'),
        version: 1,
        deletedAt: null,
        lines: [],
      }),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const period = {
    getBusinessTimezone: jest.fn().mockResolvedValue('America/Toronto'),
    assertOnOrAfterAccountingStartDate: jest.fn().mockResolvedValue(undefined),
    assertJournalEditableForPeriod: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AccountingJournalService(
    {} as never,
    period as unknown as AccountingPeriodService,
  );
  return { service, tx, plan, remittanceAuthority, accountRows };
}

describe('AccountingJournalService Payroll CRA remittance authority', () => {
  it('revalidates remittance, run, accrual and account authority before writing', async () => {
    const { service, tx, plan } = makeService();

    const result = await service.createPayrollCraRemittanceJournalInTx(
      plan.journal,
      'actor_remit',
      plan.authority,
      tx as never,
    );

    expect(result.entryStableId).toBe('journal_cra_remittance_1');
    expect(tx.payrollCraRemittance.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { remittanceStableId: 'cra_remittance_1' },
      }),
    );
    expect(tx.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an included Payroll run changes before Journal write', async () => {
    const { service, tx, plan, remittanceAuthority } = makeService();
    const [remittanceRun] = remittanceAuthority.runs;
    if (!remittanceRun) throw new Error('missing remittance authority fixture');
    tx.payrollCraRemittance.findUnique.mockResolvedValue({
      ...remittanceAuthority,
      runs: [
        {
          ...remittanceRun,
          run: {
            ...remittanceRun.run,
            calculationHash: 'sha256:' + 'b'.repeat(64),
          },
        },
      ],
    });

    await expect(
      service.createPayrollCraRemittanceJournalInTx(
        plan.journal,
        'actor_remit',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll CRA remittance run authority changed before Journal posting',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when an included accrual Journal is deleted', async () => {
    const { service, tx, plan } = makeService();
    tx.accountingJournalEntry.findMany.mockResolvedValue([
      {
        entryStableId: 'journal_payroll_accrual_1',
        source: AccountingJournalSource.PAYROLL,
        sourceFactType: 'payroll.run.accrual.v1',
        sourceFactStableId: 'payroll_run_1',
        deletedAt: new Date('2026-10-20T12:00:00.000Z'),
      },
    ]);

    await expect(
      service.createPayrollCraRemittanceJournalInTx(
        plan.journal,
        'actor_remit',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll accrual Journal authority is not active for CRA remittance',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it('fails closed when the selected BANK account changes before posting', async () => {
    const { service, tx, plan, accountRows } = makeService();
    tx.accountingAccount.findMany.mockResolvedValue(
      accountRows.map((account) => ({
        ...account,
        isActive:
          account.accountStableId === 'account_primary_bank'
            ? false
            : account.isActive,
      })),
    );

    await expect(
      service.createPayrollCraRemittanceJournalInTx(
        plan.journal,
        'actor_remit',
        plan.authority,
        tx as never,
      ),
    ).rejects.toThrow(
      'Payroll CRA remittance account authority changed before posting: account_primary_bank',
    );
    expect(tx.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
