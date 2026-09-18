import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACCOUNTING_DB, type AccountingDb } from '../accounting-db';
import { runSerializableAccountingWrite } from '../accounting-atomic-write';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import { AccountingChartService } from '../accounting-chart.service';
import { AccountingJournalService } from '../accounting-journal.service';
import { AccountingJournalPolicyError } from '../accounting-journal-policy';
import {
  buildPayrollRunAccrualWritePlan,
  type PayrollAccountFact,
  type PayrollRunAccrualFactV1,
} from './payroll-journal-write-authority';
import {
  PAYROLL_RUN_INCLUDE,
  payrollJsonValue,
} from './payroll-run-persistence';
import {
  payrollRunDto,
  type PayrollRunViewRecord,
} from './payroll-run-presenter';
import { requirePayrollStableId } from './payroll-lifecycle-input';
import {
  assertPayrollCalculatedEvidenceComplete,
  assertPayrollRunStatusTransition,
} from './payroll-policy';
import { PayrollRunStatus } from './payroll-contracts';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';

const POST_ATTEMPTS = 2;

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const assertCalculatedEvidence = (
  input: Parameters<typeof assertPayrollCalculatedEvidenceComplete>[0],
): void => {
  try {
    assertPayrollCalculatedEvidenceComplete(input);
  } catch (error) {
    throw new ConflictException(
      error instanceof Error
        ? error.message
        : 'calculated payroll evidence is incomplete',
    );
  }
};

const assertPostTransition = (): void => {
  try {
    assertPayrollRunStatusTransition(
      PayrollRunStatus.APPROVED,
      PayrollRunStatus.POSTED,
    );
  } catch (error) {
    throw new ConflictException(
      error instanceof Error ? error.message : 'invalid payroll transition',
    );
  }
};

const requireAmount = (
  value: number | null,
  field: string,
): number => {
  if (value === null) {
    throw new ConflictException(
      `${field} is required before Payroll posting`,
    );
  }
  return value;
};

const buildAccrualFact = (
  run: PayrollRunViewRecord & {
    calculationHash: string | null;
  },
): PayrollRunAccrualFactV1 => {
  if (!run.calculationHash || !run.approvedAt) {
    throw new ConflictException(
      'Payroll run must have frozen calculation and approval evidence before posting',
    );
  }
  return {
    runStableId: run.runStableId,
    calculationHash: run.calculationHash,
    approvedAt: run.approvedAt.toISOString(),
    storeStableId: run.storeStableId,
    payDate: run.payDate.toISOString().slice(0, 10),
    grossPayCents: requireAmount(run.grossPayCents, 'grossPayCents'),
    totalEmployeeDeductionsCents: requireAmount(
      run.totalEmployeeDeductionsCents,
      'totalEmployeeDeductionsCents',
    ),
    netPayCents: requireAmount(run.netPayCents, 'netPayCents'),
    incomeTaxCents: requireAmount(run.incomeTaxCents, 'incomeTaxCents'),
    employeeCppCents: requireAmount(run.employeeCppCents, 'employeeCppCents'),
    employeeCpp2Cents: requireAmount(
      run.employeeCpp2Cents,
      'employeeCpp2Cents',
    ),
    employeeEiCents: requireAmount(run.employeeEiCents, 'employeeEiCents'),
    employerCppCents: requireAmount(run.employerCppCents, 'employerCppCents'),
    employerCpp2Cents: requireAmount(
      run.employerCpp2Cents,
      'employerCpp2Cents',
    ),
    employerEiCents: requireAmount(run.employerEiCents, 'employerEiCents'),
    vacationPayAccruedCents: requireAmount(
      run.vacationPayAccruedCents,
      'vacationPayAccruedCents',
    ),
    compensationExpenseCents: requireAmount(
      run.compensationExpenseCents,
      'compensationExpenseCents',
    ),
    craRemittanceCents: requireAmount(
      run.craRemittanceCents,
      'craRemittanceCents',
    ),
    supportedEmployerPayrollCostCents: requireAmount(
      run.supportedEmployerPayrollCostCents,
      'supportedEmployerPayrollCostCents',
    ),
  };
};

@Injectable()
export class AccountingPayrollPostingService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly chart: AccountingChartService,
    private readonly journal: AccountingJournalService,
  ) {}

  async postRunAccrual(runStableIdRaw: string, actorRef: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');

    let lastError: unknown;
    for (let attempt = 0; attempt < POST_ATTEMPTS; attempt += 1) {
      try {
        return await this.postOnce(runStableId, actorRef);
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Payroll posting retry exhausted');
  }

  private async postOnce(runStableId: string, actorRef: string) {
    const accountFacts = (await this.chart.readAccountingAccountFacts()).map(
      (fact): PayrollAccountFact => ({
        accountStableId: fact.accountStableId,
        accountClass: fact.accountClass,
        currency: fact.currency,
        isActive: fact.isActive,
      }),
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.payrollRun.findUnique({
        where: { runStableId },
        include: PAYROLL_RUN_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Payroll run not found');
      if (
        existing.status !== PayrollRunStatus.APPROVED &&
        existing.status !== PayrollRunStatus.POSTED
      ) {
        throw new ConflictException(
          'Only APPROVED Payroll runs can be posted',
        );
      }
      assertCalculatedEvidence(existing);
      const persistedHash = hashPayrollCalculationEvidence({
        calculationEvidenceVersion: existing.calculationEvidenceVersion,
        employeeConfigStableId: existing.employeeConfigStableId,
        employerConfigStableId: existing.employerConfigStableId,
        input: existing.calculationInputJson,
        output: existing.calculationOutputJson,
      });
      if (persistedHash !== existing.calculationHash) {
        throw new ConflictException(
          'Payroll calculation evidence hash is invalid; posting is blocked',
        );
      }
      if (existing.status === PayrollRunStatus.APPROVED) {
        assertPostTransition();
      } else if (!existing.postedJournalEntryStableId || !existing.postedAt) {
        throw new ConflictException(
          'POSTED Payroll run is missing its Journal posting evidence',
        );
      }

      const runRecord = existing as PayrollRunViewRecord & {
        calculationHash: string | null;
      };
      let plan: ReturnType<typeof buildPayrollRunAccrualWritePlan>;
      try {
        plan = buildPayrollRunAccrualWritePlan({
          fact: buildAccrualFact(runRecord),
          accountFacts,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }
      const journal = await this.journal.createPayrollRunAccrualJournalInTx(
        plan.journal,
        actorRef,
        plan.authority,
        tx,
      );

      if (existing.status === PayrollRunStatus.POSTED) {
        if (existing.postedJournalEntryStableId !== journal.entryStableId) {
          throw new ConflictException(
            'POSTED Payroll run is bound to a different Journal entry',
          );
        }
        return payrollRunDto(runRecord);
      }

      const updated = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: PayrollRunStatus.POSTED,
          postedJournalEntryStableId: journal.entryStableId,
          postedAt: new Date(),
          version: { increment: 1 },
          updatedByActorRef: actorRef,
        },
        include: PAYROLL_RUN_INCLUDE,
      });
      const before = payrollRunDto(runRecord);
      const after = payrollRunDto(updated as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_POST',
        entityType: 'PAYROLL_RUN',
        entityId: runStableId,
        operatorActorRef: actorRef,
        beforeJson: payrollJsonValue(before),
        afterJson: payrollJsonValue(after),
      });
      return after;
    });
  }
}
