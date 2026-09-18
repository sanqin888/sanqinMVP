import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACCOUNTING_DB, type AccountingDb } from '../accounting-db';
import { runSerializableAccountingWrite } from '../accounting-atomic-write';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import { PayrollRunStatus } from './payroll-contracts';
import {
  assertPayrollRunDraft,
  assertPayrollRunStatusTransition,
} from './payroll-policy';
import type {
  CreatePayrollRunInput,
  UpdatePayrollRunInput,
} from './payroll-lifecycle.contracts';
import {
  normalizePayrollOptionalText,
  parsePayrollDateOnly,
  requireNonNegativePayrollInteger,
  requirePayrollStableId,
} from './payroll-lifecycle-input';
import {
  PAYROLL_CALCULATION_RESET_DATA,
  PAYROLL_RUN_INCLUDE,
  payrollJsonValue,
} from './payroll-run-persistence';
import {
  payrollRunDto,
  type PayrollRunViewRecord,
} from './payroll-run-presenter';

const assertDraft = (input: Parameters<typeof assertPayrollRunDraft>[0]) => {
  try {
    assertPayrollRunDraft(input);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'invalid payroll run input',
    );
  }
};

@Injectable()
export class AccountingPayrollRunService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listRuns(employeeStableIdRaw?: string) {
    let employeeId: string | undefined;
    if (employeeStableIdRaw?.trim()) {
      const employeeStableId = requirePayrollStableId(
        employeeStableIdRaw,
        'employeeStableId',
      );
      const employee = await this.prisma.payrollEmployee.findUnique({
        where: { employeeStableId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Payroll employee not found');
      employeeId = employee.id;
    }

    const rows = await this.prisma.payrollRun.findMany({
      where: employeeId ? { employeeId } : undefined,
      orderBy: [{ payDate: 'desc' }, { createdAt: 'desc' }],
      include: PAYROLL_RUN_INCLUDE,
      take: 200,
    });
    return rows.map((row) => payrollRunDto(row as PayrollRunViewRecord));
  }

  async getRun(runStableIdRaw: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');
    const run = await this.prisma.payrollRun.findUnique({
      where: { runStableId },
      include: PAYROLL_RUN_INCLUDE,
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    return payrollRunDto(run as PayrollRunViewRecord);
  }

  async createDraft(input: CreatePayrollRunInput, actorRef: string) {
    const employeeStableId = requirePayrollStableId(
      input.employeeStableId,
      'employeeStableId',
    );
    const periodStart = parsePayrollDateOnly(input.periodStart, 'periodStart');
    const periodEnd = parsePayrollDateOnly(input.periodEnd, 'periodEnd');
    const payDate = parsePayrollDateOnly(input.payDate, 'payDate');
    if (payDate < periodEnd) {
      throw new BadRequestException('payDate cannot be before periodEnd');
    }

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const employee = await tx.payrollEmployee.findUnique({
        where: { employeeStableId },
        include: { employer: true },
      });
      if (!employee) throw new NotFoundException('Payroll employee not found');
      if (!employee.isActive || !employee.employer.isActive) {
        throw new ConflictException(
          'Payroll employee and employer must be active to create a run',
        );
      }
      if (
        periodStart < employee.employmentStartDate ||
        (employee.employmentEndDate && periodEnd > employee.employmentEndDate)
      ) {
        throw new BadRequestException(
          'pay period must fall within the employee employment dates',
        );
      }

      const duplicate = await tx.payrollRun.findFirst({
        where: {
          employeeId: employee.id,
          payDate,
          correctionSequence: 0,
        },
        select: { runStableId: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'A Payroll run already exists for this employee and payDate',
        );
      }

      const employeeConfig = await tx.payrollEmployeeConfigVersion.findFirst({
        where: {
          employeeId: employee.id,
          effectiveFrom: { lte: payDate },
        },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
      });
      if (!employeeConfig) {
        throw new ConflictException(
          'No effective Payroll employee config exists for this payDate',
        );
      }
      const employerConfig = await tx.payrollEmployerConfigVersion.findFirst({
        where: {
          employerId: employee.employerId,
          effectiveFrom: { lte: payDate },
        },
        orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
        select: { configStableId: true },
      });
      if (!employerConfig) {
        throw new ConflictException(
          'No effective Payroll employer config exists for this payDate',
        );
      }

      const regularMinutes = requireNonNegativePayrollInteger(
        input.regularMinutes,
        'regularMinutes',
      );
      const regularHourlyRateCents = requireNonNegativePayrollInteger(
        input.regularHourlyRateCents ?? employeeConfig.defaultHourlyRateCents,
        'regularHourlyRateCents',
      );
      const overtimeMinutes = requireNonNegativePayrollInteger(
        input.overtimeMinutes ?? 0,
        'overtimeMinutes',
      );
      if (
        overtimeMinutes > 0 &&
        (input.overtimeHourlyRateCents == null ||
          input.overtimeHourlyRateCents <= 0)
      ) {
        throw new BadRequestException(
          'overtimeHourlyRateCents is required when overtimeMinutes is positive',
        );
      }
      const overtimeHourlyRateCents = requireNonNegativePayrollInteger(
        input.overtimeHourlyRateCents ?? 0,
        'overtimeHourlyRateCents',
      );
      const vacationTopUpCents = requireNonNegativePayrollInteger(
        input.vacationTopUpCents ?? 0,
        'vacationTopUpCents',
      );
      const storeStableId =
        normalizePayrollOptionalText(input.storeStableId) ??
        employee.storeStableId ??
        employee.employer.defaultStoreStableId ??
        '';

      const draft = {
        correctionSequence: 0,
        periodStart,
        periodEnd,
        payDate,
        storeStableId,
        regularMinutes,
        regularHourlyRateCents,
        overtimeMinutes,
        overtimeHourlyRateCents,
        vacationTopUpCents,
      };
      assertDraft(draft);

      const created = await tx.payrollRun.create({
        data: {
          employerId: employee.employerId,
          employeeId: employee.id,
          ...draft,
          createdByActorRef: actorRef,
          updatedByActorRef: actorRef,
        },
        include: PAYROLL_RUN_INCLUDE,
      });
      const dto = payrollRunDto(created as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_CREATE',
        entityType: 'PAYROLL_RUN',
        entityId: created.runStableId,
        operatorActorRef: actorRef,
        afterJson: payrollJsonValue(dto),
      });
      return dto;
    });
  }

  async updateDraft(
    runStableIdRaw: string,
    input: UpdatePayrollRunInput,
    actorRef: string,
  ) {
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
          'Only DRAFT or CALCULATED Payroll runs can be edited',
        );
      }
      if (existing.status === PayrollRunStatus.CALCULATED) {
        try {
          assertPayrollRunStatusTransition(
            PayrollRunStatus.CALCULATED,
            PayrollRunStatus.DRAFT,
          );
        } catch (error) {
          throw new ConflictException(
            error instanceof Error
              ? error.message
              : 'invalid payroll transition',
          );
        }
      }

      const periodStart =
        input.periodStart === undefined
          ? existing.periodStart
          : parsePayrollDateOnly(input.periodStart, 'periodStart');
      const periodEnd =
        input.periodEnd === undefined
          ? existing.periodEnd
          : parsePayrollDateOnly(input.periodEnd, 'periodEnd');
      const payDate =
        input.payDate === undefined
          ? existing.payDate
          : parsePayrollDateOnly(input.payDate, 'payDate');
      if (payDate < periodEnd) {
        throw new BadRequestException('payDate cannot be before periodEnd');
      }

      const employee = await tx.payrollEmployee.findUnique({
        where: { id: existing.employeeId },
        select: {
          employmentStartDate: true,
          employmentEndDate: true,
        },
      });
      if (!employee) {
        throw new ConflictException('Payroll run employee no longer exists');
      }
      if (
        periodStart < employee.employmentStartDate ||
        (employee.employmentEndDate && periodEnd > employee.employmentEndDate)
      ) {
        throw new BadRequestException(
          'pay period must fall within the employee employment dates',
        );
      }

      if (payDate.getTime() !== existing.payDate.getTime()) {
        const duplicate = await tx.payrollRun.findFirst({
          where: {
            id: { not: existing.id },
            employeeId: existing.employeeId,
            payDate,
            correctionSequence: 0,
          },
          select: { runStableId: true },
        });
        if (duplicate) {
          throw new ConflictException(
            'A Payroll run already exists for this employee and payDate',
          );
        }
      }

      const draft = {
        correctionSequence: existing.correctionSequence,
        periodStart,
        periodEnd,
        payDate,
        storeStableId:
          normalizePayrollOptionalText(input.storeStableId) ??
          existing.storeStableId,
        regularMinutes: requireNonNegativePayrollInteger(
          input.regularMinutes ?? existing.regularMinutes,
          'regularMinutes',
        ),
        regularHourlyRateCents: requireNonNegativePayrollInteger(
          input.regularHourlyRateCents ?? existing.regularHourlyRateCents,
          'regularHourlyRateCents',
        ),
        overtimeMinutes: requireNonNegativePayrollInteger(
          input.overtimeMinutes ?? existing.overtimeMinutes,
          'overtimeMinutes',
        ),
        overtimeHourlyRateCents: requireNonNegativePayrollInteger(
          input.overtimeHourlyRateCents ?? existing.overtimeHourlyRateCents,
          'overtimeHourlyRateCents',
        ),
        vacationTopUpCents: requireNonNegativePayrollInteger(
          input.vacationTopUpCents ?? existing.vacationTopUpCents,
          'vacationTopUpCents',
        ),
      };
      if (draft.overtimeMinutes > 0 && draft.overtimeHourlyRateCents <= 0) {
        throw new BadRequestException(
          'overtimeHourlyRateCents must be positive when overtimeMinutes is positive',
        );
      }
      assertDraft(draft);

      const updated = await tx.payrollRun.update({
        where: { id: existing.id },
        data: {
          ...draft,
          ...PAYROLL_CALCULATION_RESET_DATA,
          status: PayrollRunStatus.DRAFT,
          version: { increment: 1 },
          updatedByActorRef: actorRef,
        },
        include: PAYROLL_RUN_INCLUDE,
      });
      const before = payrollRunDto(existing as PayrollRunViewRecord);
      const after = payrollRunDto(updated as PayrollRunViewRecord);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_RUN_UPDATE',
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
