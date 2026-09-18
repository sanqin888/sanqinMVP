import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACCOUNTING_DB, type AccountingDb } from '../accounting-db';
import { runSerializableAccountingWrite } from '../accounting-atomic-write';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import {
  PAYROLL_CALCULATION_EVIDENCE_VERSION,
  PayrollRunStatus,
} from './payroll-contracts';
import {
  assertPayrollCalculatedEvidenceComplete,
  assertPayrollRunStatusTransition,
} from './payroll-policy';
import {
  buildPayrollRunCalculation,
  type PayrollRunCalculationRecord,
} from './payroll-run-calculation';
import { hashPayrollCalculationEvidence } from './payroll-calculation-evidence';
import {
  PAYROLL_RUN_INCLUDE,
  payrollJsonValue,
} from './payroll-run-persistence';
import {
  payrollRunDto,
  type PayrollRunViewRecord,
} from './payroll-run-presenter';
import { requirePayrollStableId } from './payroll-lifecycle-input';
import { AccountingPayrollYtdService } from './accounting-payroll-ytd.service';

const assertTransition = (from: PayrollRunStatus, to: PayrollRunStatus) => {
  try {
    assertPayrollRunStatusTransition(from, to);
  } catch (error) {
    throw new ConflictException(
      error instanceof Error ? error.message : 'invalid payroll transition',
    );
  }
};

const assertCalculatedEvidence = (
  input: Parameters<typeof assertPayrollCalculatedEvidenceComplete>[0],
) => {
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

@Injectable()
export class AccountingPayrollFinalizationService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly ytdService: AccountingPayrollYtdService,
  ) {}

  async calculateRun(runStableIdRaw: string, actorRef: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.payrollRun.findUnique({
        where: { runStableId },
        include: PAYROLL_RUN_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Payroll run not found');
      if (
        existing.status !== PayrollRunStatus.DRAFT &&
        existing.status !== PayrollRunStatus.CALCULATED
      ) {
        throw new ConflictException(
          'Only DRAFT or CALCULATED Payroll runs can be calculated',
        );
      }
      assertTransition(
        existing.status as PayrollRunStatus,
        PayrollRunStatus.CALCULATED,
      );

      const ytd = await this.ytdService.deriveForEmployeeId(
        tx,
        existing.employeeId,
        existing.payDate.getUTCFullYear(),
        existing.payDate,
      );
      const result = await buildPayrollRunCalculation(
        tx,
        existing as PayrollRunCalculationRecord,
        ytd,
      );
      if (!result.ok) return result;

      const { calculation } = result;
      const output = calculation.output;
      const updateData = {
        employeeConfigStableId: calculation.employeeConfigStableId,
        employerConfigStableId: calculation.employerConfigStableId,
        statutoryPolicyVersion: output.statutoryPolicyVersion,
        payPeriodsPerYear: output.payPeriodsPerYear,
        calculationProfileVersion: output.calculationProfileVersion,
        regularPayCents: output.regularPayCents,
        overtimePayCents: output.overtimePayCents,
        vacationPayPaidCents: output.vacationPayPaidCents,
        vacationPayAccruedCents: output.vacationPayAccruedCents,
        grossPayCents: output.grossPayCents,
        periodicTaxableEarningsCents: output.periodicTaxableEarningsCents,
        nonPeriodicTaxableEarningsCents: output.nonPeriodicTaxableEarningsCents,
        pensionableEarningsCents: output.pensionableEarningsCents,
        insurableEarningsCents: output.insurableEarningsCents,
        incomeTaxCents: output.incomeTaxCents,
        employeeCppCents: output.employeeCppCents,
        employeeCpp2Cents: output.employeeCpp2Cents,
        employeeEiCents: output.employeeEiCents,
        employerCppCents: output.employerCppCents,
        employerCpp2Cents: output.employerCpp2Cents,
        employerEiCents: output.employerEiCents,
        totalEmployeeDeductionsCents: output.totalEmployeeDeductionsCents,
        netPayCents: output.netPayCents,
        craRemittanceCents: output.craRemittanceCents,
        compensationExpenseCents: output.compensationExpenseCents,
        supportedEmployerPayrollCostCents:
          output.supportedEmployerPayrollCostCents,
        calculationEvidenceVersion: PAYROLL_CALCULATION_EVIDENCE_VERSION,
        calculationInputJson: payrollJsonValue(calculation.input),
        calculationOutputJson: payrollJsonValue(output),
        calculationHash: calculation.calculationHash,
        ytdBeforeJson: payrollJsonValue(calculation.input.ytd),
        ytdAfterJson: payrollJsonValue(output.ytdAfter),
        status: PayrollRunStatus.CALCULATED,
        version: { increment: 1 },
        updatedByActorRef: actorRef,
      };
      assertCalculatedEvidence({ ...existing, ...updateData });

      const updated = await tx.payrollRun.update({
        where: { id: existing.id },
        data: updateData,
        include: PAYROLL_RUN_INCLUDE,
      });
      const after = payrollRunDto(updated as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_CALCULATE',
        entityType: 'PAYROLL_RUN',
        entityId: runStableId,
        operatorActorRef: actorRef,
        beforeJson: payrollJsonValue(
          payrollRunDto(existing as PayrollRunViewRecord),
        ),
        afterJson: payrollJsonValue(after),
      });
      return { ok: true as const, run: after };
    });
  }

  async approveRun(runStableIdRaw: string, actorRef: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.payrollRun.findUnique({
        where: { runStableId },
        include: PAYROLL_RUN_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Payroll run not found');
      if (existing.status !== PayrollRunStatus.CALCULATED) {
        throw new ConflictException(
          'Only CALCULATED Payroll runs can be approved',
        );
      }
      assertTransition(PayrollRunStatus.CALCULATED, PayrollRunStatus.APPROVED);
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
          'Payroll calculation evidence hash is invalid; recalculate before approval',
        );
      }

      const ytd = await this.ytdService.deriveForEmployeeId(
        tx,
        existing.employeeId,
        existing.payDate.getUTCFullYear(),
        existing.payDate,
      );
      const fresh = await buildPayrollRunCalculation(
        tx,
        existing as PayrollRunCalculationRecord,
        ytd,
      );
      if (
        !fresh.ok ||
        fresh.calculation.calculationHash !== existing.calculationHash
      ) {
        throw new ConflictException(
          'Payroll calculation is stale; recalculate before approval',
        );
      }

      const updated = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: PayrollRunStatus.APPROVED,
          approvedByActorRef: actorRef,
          approvedAt: new Date(),
          version: { increment: 1 },
          updatedByActorRef: actorRef,
        },
        include: PAYROLL_RUN_INCLUDE,
      });
      const after = payrollRunDto(updated as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_APPROVE',
        entityType: 'PAYROLL_RUN',
        entityId: runStableId,
        operatorActorRef: actorRef,
        beforeJson: payrollJsonValue(
          payrollRunDto(existing as PayrollRunViewRecord),
        ),
        afterJson: payrollJsonValue(after),
      });
      return after;
    });
  }

  async voidRun(runStableIdRaw: string, actorRef: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.payrollRun.findUnique({
        where: { runStableId },
        include: PAYROLL_RUN_INCLUDE,
      });
      if (!existing) throw new NotFoundException('Payroll run not found');
      if (existing.status !== PayrollRunStatus.APPROVED) {
        throw new ConflictException(
          'Only APPROVED and unposted Payroll runs can be voided',
        );
      }
      assertTransition(PayrollRunStatus.APPROVED, PayrollRunStatus.VOIDED);

      const laterFinalized = await tx.payrollRun.findFirst({
        where: {
          employeeId: existing.employeeId,
          payDate: { gt: existing.payDate },
          status: {
            in: [PayrollRunStatus.APPROVED, PayrollRunStatus.POSTED],
          },
        },
        select: { runStableId: true },
      });
      if (laterFinalized) {
        throw new ConflictException(
          'Cannot void this run after a later Payroll run has been finalized',
        );
      }

      const updated = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          status: PayrollRunStatus.VOIDED,
          voidedAt: new Date(),
          version: { increment: 1 },
          updatedByActorRef: actorRef,
        },
        include: PAYROLL_RUN_INCLUDE,
      });
      const after = payrollRunDto(updated as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_VOID',
        entityType: 'PAYROLL_RUN',
        entityId: runStableId,
        operatorActorRef: actorRef,
        beforeJson: payrollJsonValue(
          payrollRunDto(existing as PayrollRunViewRecord),
        ),
        afterJson: payrollJsonValue(after),
      });
      return after;
    });
  }
}
