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
  buildPayrollRunReversalWritePlan,
  type PayrollRunReversalFactV1,
} from './payroll-reversal-journal-authority';
import {
  PAYROLL_RUN_INCLUDE,
  payrollJsonValue,
} from './payroll-run-persistence';
import {
  payrollRunDto,
  type PayrollRunViewRecord,
} from './payroll-run-presenter';
import {
  requirePayrollStableId,
  requirePayrollText,
} from './payroll-lifecycle-input';
import type { ReversePayrollRunInput } from './payroll-lifecycle.contracts';
import {
  assertPayrollCalculatedEvidenceComplete,
  assertPayrollRunStatusTransition,
} from './payroll-policy';
import { PayrollRunStatus } from './payroll-contracts';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';
import type { PayrollAccountFact } from './payroll-journal-write-authority';

const REVERSAL_ATTEMPTS = 2;

const REVERSAL_RUN_INCLUDE = {
  ...PAYROLL_RUN_INCLUDE,
  employeePayment: { select: { paymentStableId: true } },
  craRemittanceEvidence: {
    select: {
      remittance: { select: { remittanceStableId: true } },
    },
  },
} as const;

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

const assertReverseTransition = (): void => {
  try {
    assertPayrollRunStatusTransition(
      PayrollRunStatus.POSTED,
      PayrollRunStatus.REVERSED,
    );
  } catch (error) {
    throw new ConflictException(
      error instanceof Error ? error.message : 'invalid payroll transition',
    );
  }
};

const requireAmount = (value: number | null, field: string): number => {
  if (value === null) {
    throw new ConflictException(`${field} is required before Payroll reversal`);
  }
  return value;
};

const buildReversalFact = (
  run: PayrollRunViewRecord & {
    calculationHash: string | null;
  },
): PayrollRunReversalFactV1 => {
  if (
    !run.calculationHash ||
    !run.approvedAt ||
    !run.postedJournalEntryStableId ||
    !run.reversedAt ||
    !run.reversedByActorRef ||
    !run.reversalReason
  ) {
    throw new ConflictException(
      'Payroll run is missing frozen reversal authority evidence',
    );
  }

  return {
    runStableId: run.runStableId,
    calculationHash: run.calculationHash,
    approvedAt: run.approvedAt.toISOString(),
    postedAccrualJournalEntryStableId: run.postedJournalEntryStableId,
    storeStableId: run.storeStableId,
    payDate: run.payDate.toISOString().slice(0, 10),
    accrualDate: run.periodEnd.toISOString().slice(0, 10),
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
    reversedAt: run.reversedAt.toISOString(),
    reversedByActorRef: run.reversedByActorRef,
    reversalReason: run.reversalReason,
  };
};

@Injectable()
export class AccountingPayrollReversalService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly chart: AccountingChartService,
    private readonly journal: AccountingJournalService,
  ) {}

  async reverseRun(
    runStableIdRaw: string,
    input: ReversePayrollRunInput,
    actorRef: string,
  ) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');
    const reason = requirePayrollText(input.reason, 'reason');

    let lastError: unknown;
    for (let attempt = 0; attempt < REVERSAL_ATTEMPTS; attempt += 1) {
      try {
        return await this.reverseOnce(runStableId, reason, actorRef);
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Payroll reversal retry exhausted');
  }

  private async reverseOnce(
    runStableId: string,
    reason: string,
    actorRef: string,
  ) {
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
        include: REVERSAL_RUN_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Payroll run not found');
      if (
        existing.status !== PayrollRunStatus.POSTED &&
        existing.status !== PayrollRunStatus.REVERSED
      ) {
        throw new ConflictException('Only POSTED Payroll runs can be reversed');
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
          'Payroll calculation evidence hash is invalid; reversal is blocked',
        );
      }
      if (!existing.postedJournalEntryStableId || !existing.postedAt) {
        throw new ConflictException(
          'POSTED Payroll run is missing its Journal posting evidence',
        );
      }
      if (existing.employeePayment) {
        throw new ConflictException(
          'Payroll run already has an employee payment settlement and cannot be reversed',
        );
      }
      if (existing.craRemittanceEvidence) {
        throw new ConflictException(
          'Payroll run is already included in a CRA remittance and cannot be reversed',
        );
      }

      if (existing.status === PayrollRunStatus.REVERSED) {
        if (
          !existing.reversalJournalEntryStableId ||
          !existing.reversedAt ||
          !existing.reversedByActorRef ||
          !existing.reversalReason
        ) {
          throw new ConflictException(
            'REVERSED Payroll run is missing its reversal evidence',
          );
        }
        if (existing.reversalReason !== reason) {
          throw new ConflictException(
            'Payroll run is already reversed with a different reason',
          );
        }
      } else {
        assertReverseTransition();
        if (
          existing.reversalJournalEntryStableId ||
          existing.reversedAt ||
          existing.reversedByActorRef ||
          existing.reversalReason
        ) {
          throw new ConflictException(
            'POSTED Payroll run contains partial reversal evidence',
          );
        }

        const laterFinalized = await tx.payrollRun.findFirst({
          where: {
            employeeId: existing.employeeId,
            status: {
              in: [
                PayrollRunStatus.APPROVED,
                PayrollRunStatus.POSTED,
                PayrollRunStatus.REVERSED,
              ],
            },
            OR: [
              { payDate: { gt: existing.payDate } },
              {
                payDate: existing.payDate,
                correctionSequence: { gt: existing.correctionSequence },
              },
            ],
          },
          select: { runStableId: true },
        });
        if (laterFinalized) {
          throw new ConflictException(
            'Cannot reverse this run after a later Payroll run has been finalized',
          );
        }
      }

      const before = payrollRunDto(existing as unknown as PayrollRunViewRecord);
      const reversalRecord =
        existing.status === PayrollRunStatus.REVERSED
          ? existing
          : await tx.payrollRun.update({
              where: { id: existing.id },
              data: {
                reversedAt: new Date(),
                reversedByActorRef: actorRef,
                reversalReason: reason,
                updatedByActorRef: actorRef,
              },
              include: REVERSAL_RUN_INCLUDE,
            });

      let plan: ReturnType<typeof buildPayrollRunReversalWritePlan>;
      try {
        plan = buildPayrollRunReversalWritePlan({
          fact: buildReversalFact(
            reversalRecord as unknown as PayrollRunViewRecord & {
              calculationHash: string | null;
            },
          ),
          accountFacts,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }

      const reversalJournal =
        await this.journal.createPayrollRunReversalJournalInTx(
          plan.journal,
          actorRef,
          plan.authority,
          tx,
        );

      if (existing.status === PayrollRunStatus.REVERSED) {
        if (
          existing.reversalJournalEntryStableId !==
          reversalJournal.entryStableId
        ) {
          throw new ConflictException(
            'REVERSED Payroll run is bound to a different reversal Journal entry',
          );
        }
        return payrollRunDto(existing as unknown as PayrollRunViewRecord);
      }

      const updated = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: PayrollRunStatus.REVERSED,
          reversalJournalEntryStableId: reversalJournal.entryStableId,
          version: { increment: 1 },
          updatedByActorRef: actorRef,
        },
        include: PAYROLL_RUN_INCLUDE,
      });
      const after = payrollRunDto(updated as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_REVERSE',
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
