import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACCOUNTING_DB,
  type AccountingDb,
  type AccountingTransactionClient,
} from '../accounting-db';
import { runSerializableAccountingWrite } from '../accounting-atomic-write';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import { AccountingJournalPolicyError } from '../accounting-journal-policy';
import { AccountingJournalService } from '../accounting-journal.service';
import {
  buildPayrollCraRemittanceWritePlan,
  type PayrollCraRemittanceAccountFact,
} from './payroll-cra-remittance-journal-authority';
import {
  buildPayrollCraRemittancePreview,
  type PayrollCraRemittancePreviewV1,
  type PayrollCraRemittanceRunEvidenceV1,
} from './payroll-cra-remittance-evidence';
import { payrollCraRemittanceDto } from './payroll-cra-remittance-presenter';
import {
  normalizePayrollOptionalText,
  parsePayrollDateOnly,
  payrollDateOnly,
  requirePayrollStableId,
} from './payroll-lifecycle-input';
import type { CreatePayrollCraRemittanceInput } from './payroll-lifecycle.contracts';
import { derivePayrollCraRemittancePeriod } from './payroll-remittance-policy';
import {
  PayrollRunStatus,
  type PayrollRemitterType,
} from './payroll-contracts';
import { PAYROLL_ACCOUNT_IDS } from './payroll-journal-write-authority';
import { payrollJsonValue } from './payroll-run-persistence';

type PayrollDbClient = AccountingDb | AccountingTransactionClient;

const SETTLEMENT_ATTEMPTS = 2;

const REMITTANCE_INCLUDE = {
  employer: { select: { employerStableId: true } },
  runs: {
    orderBy: [{ payDate: 'asc' as const }, { id: 'asc' as const }],
    include: { run: { select: { runStableId: true } } },
  },
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const sameDate = (left: Date | null, right: Date): boolean =>
  left?.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);

const requireEvidenceHash = (raw: string): string => {
  const value = raw?.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new BadRequestException(
      'expectedEvidenceHash must use sha256:<hex> format',
    );
  }
  return value;
};

const requireRunMoney = (
  value: number | null,
  field: string,
  runStableId: string,
): number => {
  if (value === null) {
    throw new ConflictException(
      'POSTED Payroll run is missing ' + field + ': ' + runStableId,
    );
  }
  return value;
};

const derivePeriod = (remitterType: PayrollRemitterType, payDate: Date) => {
  try {
    return derivePayrollCraRemittancePeriod({ remitterType, payDate });
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error
        ? error.message
        : 'invalid CRA remittance policy input',
    );
  }
};

@Injectable()
export class AccountingPayrollCraRemittanceService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
  ) {}

  async preview(employerStableIdRaw: string, anchorDateRaw: string) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const anchorDate = parsePayrollDateOnly(anchorDateRaw, 'anchorDate');
    return this.buildPreview(this.prisma, employerStableId, anchorDate);
  }

  async listForPeriod(employerStableIdRaw: string, anchorDateRaw: string) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const anchorDate = parsePayrollDateOnly(anchorDateRaw, 'anchorDate');
    const scope = await this.resolveScope(
      this.prisma,
      employerStableId,
      anchorDate,
    );
    const rows = await this.prisma.payrollCraRemittance.findMany({
      where: {
        employerId: scope.employer.id,
        remitterType: scope.target.remitterType,
        periodStart: scope.periodStart,
        periodEnd: scope.periodEnd,
      },
      include: REMITTANCE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { remittanceStableId: 'desc' }],
    });
    return rows.map((row) => payrollCraRemittanceDto(row));
  }

  async settle(
    employerStableIdRaw: string,
    input: CreatePayrollCraRemittanceInput,
    actorRef: string,
  ) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const anchorDate = parsePayrollDateOnly(input.anchorDate, 'anchorDate');
    const expectedEvidenceHash = requireEvidenceHash(
      input.expectedEvidenceHash,
    );
    const paymentAccountStableId = requirePayrollStableId(
      input.paymentAccountStableId,
      'paymentAccountStableId',
    );
    const paymentDate = parsePayrollDateOnly(input.paymentDate, 'paymentDate');
    const reference = normalizePayrollOptionalText(input.reference) ?? null;

    let lastError: unknown;
    for (let attempt = 0; attempt < SETTLEMENT_ATTEMPTS; attempt += 1) {
      try {
        return await this.settleOnce({
          employerStableId,
          anchorDate,
          expectedEvidenceHash,
          paymentAccountStableId,
          paymentDate,
          reference,
          actorRef,
        });
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Payroll CRA remittance retry exhausted');
  }

  async buildPreview(
    db: PayrollDbClient,
    employerStableId: string,
    anchorDate: Date,
  ): Promise<PayrollCraRemittancePreviewV1> {
    const scope = await this.resolveScope(db, employerStableId, anchorDate);
    const candidates = await db.payrollRun.findMany({
      where: {
        employerId: scope.employer.id,
        status: PayrollRunStatus.POSTED,
        payDate: { gte: scope.periodStart, lte: scope.periodEnd },
        craRemittanceEvidence: null,
      },
      orderBy: [{ payDate: 'asc' }, { runStableId: 'asc' }],
      select: {
        runStableId: true,
        status: true,
        payDate: true,
        employerConfigStableId: true,
        calculationHash: true,
        postedJournalEntryStableId: true,
        postedAt: true,
        incomeTaxCents: true,
        employeeCppCents: true,
        employeeCpp2Cents: true,
        employerCppCents: true,
        employerCpp2Cents: true,
        employeeEiCents: true,
        employerEiCents: true,
        craRemittanceCents: true,
        employerConfig: {
          select: {
            configStableId: true,
            remitterType: true,
          },
        },
      },
    });

    const includedRuns: PayrollCraRemittanceRunEvidenceV1[] = [];
    for (const run of candidates) {
      if (
        run.status !== PayrollRunStatus.POSTED ||
        !run.employerConfigStableId ||
        !run.employerConfig ||
        run.employerConfig.configStableId !== run.employerConfigStableId ||
        !run.calculationHash ||
        !run.postedJournalEntryStableId ||
        !run.postedAt
      ) {
        throw new ConflictException(
          'POSTED Payroll run is missing frozen CRA remittance evidence: ' +
            run.runStableId,
        );
      }

      const runPeriod = derivePeriod(
        run.employerConfig.remitterType,
        run.payDate,
      );
      if (
        runPeriod.remitterType !== scope.target.remitterType ||
        runPeriod.periodStart !== scope.target.periodStart ||
        runPeriod.periodEnd !== scope.target.periodEnd
      ) {
        continue;
      }

      includedRuns.push({
        runStableId: run.runStableId,
        employerConfigStableId: run.employerConfigStableId,
        calculationHash: run.calculationHash,
        postedAccrualJournalEntryStableId: run.postedJournalEntryStableId,
        payDate: payrollDateOnly(run.payDate)!,
        incomeTaxCents: requireRunMoney(
          run.incomeTaxCents,
          'incomeTaxCents',
          run.runStableId,
        ),
        employeeCppCents: requireRunMoney(
          run.employeeCppCents,
          'employeeCppCents',
          run.runStableId,
        ),
        employeeCpp2Cents: requireRunMoney(
          run.employeeCpp2Cents,
          'employeeCpp2Cents',
          run.runStableId,
        ),
        employerCppCents: requireRunMoney(
          run.employerCppCents,
          'employerCppCents',
          run.runStableId,
        ),
        employerCpp2Cents: requireRunMoney(
          run.employerCpp2Cents,
          'employerCpp2Cents',
          run.runStableId,
        ),
        employeeEiCents: requireRunMoney(
          run.employeeEiCents,
          'employeeEiCents',
          run.runStableId,
        ),
        employerEiCents: requireRunMoney(
          run.employerEiCents,
          'employerEiCents',
          run.runStableId,
        ),
        craRemittanceCents: requireRunMoney(
          run.craRemittanceCents,
          'craRemittanceCents',
          run.runStableId,
        ),
      });
    }

    try {
      return buildPayrollCraRemittancePreview({
        employerStableId: scope.employer.employerStableId,
        remitterType: scope.target.remitterType,
        remittancePolicyVersion: scope.target.remittancePolicyVersion,
        periodStart: scope.target.periodStart,
        periodEnd: scope.target.periodEnd,
        dueDate: scope.target.dueDate,
        includedRuns,
      });
    } catch (error) {
      throw new ConflictException(
        error instanceof Error
          ? error.message
          : 'CRA remittance evidence is invalid',
      );
    }
  }

  private async settleOnce(input: {
    employerStableId: string;
    anchorDate: Date;
    expectedEvidenceHash: string;
    paymentAccountStableId: string;
    paymentDate: Date;
    reference: string | null;
    actorRef: string;
  }) {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const replay = await tx.payrollCraRemittance.findUnique({
        where: { evidenceHash: input.expectedEvidenceHash },
        include: REMITTANCE_INCLUDE,
      });
      if (replay) {
        if (
          replay.employer.employerStableId !== input.employerStableId ||
          replay.paymentAccountStableId !== input.paymentAccountStableId ||
          !sameDate(replay.paymentDate, input.paymentDate) ||
          replay.reference !== input.reference ||
          replay.currency !== 'CAD' ||
          !replay.journalEntryStableId
        ) {
          throw new ConflictException(
            'CRA remittance evidence is already bound to a different settlement',
          );
        }
        return payrollCraRemittanceDto(replay);
      }

      const preview = await this.buildPreview(
        tx,
        input.employerStableId,
        input.anchorDate,
      );
      if (preview.evidenceHash !== input.expectedEvidenceHash) {
        throw new ConflictException(
          'CRA remittance preview changed; refresh and review before posting',
        );
      }
      if (preview.includedRuns.length === 0 || preview.totalAmountCents <= 0) {
        throw new ConflictException(
          'CRA remittance has no positive unremitted Payroll liability',
        );
      }

      const firstIncludedRun = preview.includedRuns[0];
      if (!firstIncludedRun) {
        throw new ConflictException(
          'CRA remittance has no unremitted Payroll run evidence',
        );
      }
      const latestPayDate = preview.includedRuns.reduce(
        (latest, run) => (run.payDate > latest ? run.payDate : latest),
        firstIncludedRun.payDate,
      );
      if (payrollDateOnly(input.paymentDate)! < latestPayDate) {
        throw new ConflictException(
          'CRA remittance payment date cannot be before the latest included Payroll pay date',
        );
      }

      const created = await tx.payrollCraRemittance.create({
        data: {
          employer: {
            connect: { employerStableId: input.employerStableId },
          },
          remitterType: preview.remitterType,
          remittancePolicyVersion: preview.remittancePolicyVersion,
          periodStart: parsePayrollDateOnly(preview.periodStart, 'periodStart'),
          periodEnd: parsePayrollDateOnly(preview.periodEnd, 'periodEnd'),
          dueDate: parsePayrollDateOnly(preview.dueDate, 'dueDate'),
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
          paymentAccountStableId: input.paymentAccountStableId,
          paymentDate: input.paymentDate,
          reference: input.reference,
          createdByActorRef: input.actorRef,
          runs: {
            create: preview.includedRuns.map((run) => ({
              run: { connect: { runStableId: run.runStableId } },
              employerConfigStableId: run.employerConfigStableId,
              calculationHash: run.calculationHash,
              postedAccrualJournalEntryStableId:
                run.postedAccrualJournalEntryStableId,
              payDate: parsePayrollDateOnly(run.payDate, 'payDate'),
              incomeTaxCents: run.incomeTaxCents,
              employeeCppCents: run.employeeCppCents,
              employeeCpp2Cents: run.employeeCpp2Cents,
              employerCppCents: run.employerCppCents,
              employerCpp2Cents: run.employerCpp2Cents,
              employeeEiCents: run.employeeEiCents,
              employerEiCents: run.employerEiCents,
              craRemittanceCents: run.craRemittanceCents,
            })),
          },
        },
        include: REMITTANCE_INCLUDE,
      });

      const accountRows = await tx.accountingAccount.findMany({
        where: {
          accountStableId: {
            in: [
              PAYROLL_ACCOUNT_IDS.incomeTaxPayable,
              PAYROLL_ACCOUNT_IDS.cppPayable,
              PAYROLL_ACCOUNT_IDS.eiPayable,
              input.paymentAccountStableId,
            ],
          },
        },
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: PayrollCraRemittanceAccountFact[] = accountRows.map(
        (account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }),
      );

      let plan: ReturnType<typeof buildPayrollCraRemittanceWritePlan>;
      try {
        plan = buildPayrollCraRemittanceWritePlan({
          fact: {
            remittanceStableId: created.remittanceStableId,
            ...preview,
            paymentAccountStableId: input.paymentAccountStableId,
            paymentDate: payrollDateOnly(input.paymentDate)!,
          },
          accountFacts,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }

      const journal = await this.journal.createPayrollCraRemittanceJournalInTx(
        plan.journal,
        input.actorRef,
        plan.authority,
        tx,
      );

      const updated = await tx.payrollCraRemittance.update({
        where: { id: created.id },
        data: { journalEntryStableId: journal.entryStableId },
        include: REMITTANCE_INCLUDE,
      });
      const after = payrollCraRemittanceDto(updated);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_CRA_REMITTANCE_POST',
        entityType: 'PAYROLL_CRA_REMITTANCE',
        entityId: created.remittanceStableId,
        operatorActorRef: input.actorRef,
        beforeJson: null,
        afterJson: payrollJsonValue(after),
      });
      return after;
    });
  }

  private async resolveScope(
    db: PayrollDbClient,
    employerStableId: string,
    anchorDate: Date,
  ) {
    const employer = await db.payrollEmployer.findUnique({
      where: { employerStableId },
      select: { id: true, employerStableId: true },
    });
    if (!employer) throw new NotFoundException('Payroll employer not found');

    const anchorConfig = await db.payrollEmployerConfigVersion.findFirst({
      where: {
        employerId: employer.id,
        effectiveFrom: { lte: anchorDate },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
      select: {
        configStableId: true,
        remitterType: true,
      },
    });
    if (!anchorConfig) {
      throw new ConflictException(
        'No effective Payroll employer config exists for anchorDate',
      );
    }

    const target = derivePeriod(anchorConfig.remitterType, anchorDate);
    return {
      employer,
      target,
      periodStart: parsePayrollDateOnly(target.periodStart, 'periodStart'),
      periodEnd: parsePayrollDateOnly(target.periodEnd, 'periodEnd'),
    };
  }
}
