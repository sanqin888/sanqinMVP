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
  type AccountingJsonValue,
} from '../accounting-db';
import { runSerializableAccountingWrite } from '../accounting-atomic-write';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import {
  PAYROLL_CALCULATION_PROFILE_VERSION,
  PayrollCppTreatment,
  PayrollEiTreatment,
  PayrollIncomeTaxTreatment,
  PayrollPayFrequency,
  PayrollTd1Mode,
  PayrollVacationTreatment,
} from './payroll-contracts';
import { assertPayrollEmployeeConfig } from './payroll-policy';
import type {
  CreatePayrollEmployeeConfigInput,
  CreatePayrollEmployeeInput,
  UpdatePayrollEmployeeInput,
} from './payroll-lifecycle.contracts';
import {
  normalizePayrollOptionalText,
  parseOptionalPayrollDateOnly,
  parseOptionalPayrollTimestamp,
  parsePayrollDateOnly,
  payrollDateOnly,
  requireNonNegativePayrollInteger,
  requirePayrollEnum,
  requirePayrollStableId,
  requirePayrollText,
} from './payroll-lifecycle-input';

const toJson = (value: unknown): AccountingJsonValue =>
  value as AccountingJsonValue;

const employeeDto = (row: {
  employeeStableId: string;
  legalName: string;
  displayName: string | null;
  userStableId: string | null;
  storeStableId: string | null;
  employmentStartDate: Date;
  employmentEndDate: Date | null;
  vacationServiceStartDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  employeeStableId: row.employeeStableId,
  legalName: row.legalName,
  displayName: row.displayName,
  userStableId: row.userStableId,
  storeStableId: row.storeStableId,
  employmentStartDate: payrollDateOnly(row.employmentStartDate),
  employmentEndDate: payrollDateOnly(row.employmentEndDate),
  vacationServiceStartDate: payrollDateOnly(row.vacationServiceStartDate),
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const employeeConfigDto = (row: {
  configStableId: string;
  version: number;
  effectiveFrom: Date;
  provinceOfEmployment: string;
  payFrequency: string;
  payScheduleAnchorDate: Date;
  defaultHourlyRateCents: number;
  federalTd1Mode: string;
  federalTd1TotalClaimCents: number | null;
  ontarioTd1Mode: string;
  ontarioTd1TotalClaimCents: number | null;
  incomeTaxTreatment: string;
  additionalTaxPerPayCents: number;
  cppTreatment: string;
  cppExceptionCode: string | null;
  cppExceptionNote: string | null;
  eiTreatment: string;
  eiExceptionCode: string | null;
  eiExceptionNote: string | null;
  vacationTreatment: string;
  vacationRateBasisPoints: number;
  vacationAgreementConfirmedAt: Date | null;
  vacationAgreementNote: string | null;
  calculationProfileVersion: string;
  createdAt: Date;
}) => ({
  configStableId: row.configStableId,
  version: row.version,
  effectiveFrom: payrollDateOnly(row.effectiveFrom),
  provinceOfEmployment: row.provinceOfEmployment,
  payFrequency: row.payFrequency,
  payScheduleAnchorDate: payrollDateOnly(row.payScheduleAnchorDate),
  defaultHourlyRateCents: row.defaultHourlyRateCents,
  federalTd1Mode: row.federalTd1Mode,
  federalTd1TotalClaimCents: row.federalTd1TotalClaimCents,
  ontarioTd1Mode: row.ontarioTd1Mode,
  ontarioTd1TotalClaimCents: row.ontarioTd1TotalClaimCents,
  incomeTaxTreatment: row.incomeTaxTreatment,
  additionalTaxPerPayCents: row.additionalTaxPerPayCents,
  cppTreatment: row.cppTreatment,
  cppExceptionCode: row.cppExceptionCode,
  cppExceptionNote: row.cppExceptionNote,
  eiTreatment: row.eiTreatment,
  eiExceptionCode: row.eiExceptionCode,
  eiExceptionNote: row.eiExceptionNote,
  vacationTreatment: row.vacationTreatment,
  vacationRateBasisPoints: row.vacationRateBasisPoints,
  vacationAgreementConfirmedAt:
    row.vacationAgreementConfirmedAt?.toISOString() ?? null,
  vacationAgreementNote: row.vacationAgreementNote,
  calculationProfileVersion: row.calculationProfileVersion,
  createdAt: row.createdAt.toISOString(),
});

const validateEmploymentDates = (
  start: Date,
  end: Date | null,
  vacationServiceStart: Date | null,
) => {
  if (end && end < start) {
    throw new BadRequestException(
      'employmentEndDate cannot be before employmentStartDate',
    );
  }
  if (vacationServiceStart && end && vacationServiceStart > end) {
    throw new BadRequestException(
      'vacationServiceStartDate cannot be after employmentEndDate',
    );
  }
};

@Injectable()
export class AccountingPayrollEmployeeService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listEmployees(
    employerStableIdRaw: string,
    includeInactive = false,
  ) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const employer = await this.prisma.payrollEmployer.findUnique({
      where: { employerStableId },
      select: { id: true },
    });
    if (!employer) throw new NotFoundException('Payroll employer not found');

    const rows = await this.prisma.payrollEmployee.findMany({
      where: {
        employerId: employer.id,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: 'desc' }, { legalName: 'asc' }],
    });
    return rows.map(employeeDto);
  }

  async createEmployee(
    employerStableIdRaw: string,
    input: CreatePayrollEmployeeInput,
    actorRef: string,
  ) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const employmentStartDate = parsePayrollDateOnly(
      input.employmentStartDate,
      'employmentStartDate',
    );
    const employmentEndDate =
      parseOptionalPayrollDateOnly(
        input.employmentEndDate,
        'employmentEndDate',
      ) ?? null;
    const vacationServiceStartDate =
      parseOptionalPayrollDateOnly(
        input.vacationServiceStartDate,
        'vacationServiceStartDate',
      ) ?? null;
    validateEmploymentDates(
      employmentStartDate,
      employmentEndDate,
      vacationServiceStartDate,
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const employer = await tx.payrollEmployer.findUnique({
        where: { employerStableId },
        select: { id: true },
      });
      if (!employer) throw new NotFoundException('Payroll employer not found');

      const created = await tx.payrollEmployee.create({
        data: {
          employerId: employer.id,
          legalName: requirePayrollText(input.legalName, 'legalName'),
          displayName:
            normalizePayrollOptionalText(input.displayName) ?? null,
          userStableId:
            normalizePayrollOptionalText(input.userStableId) ?? null,
          storeStableId:
            normalizePayrollOptionalText(input.storeStableId) ?? null,
          employmentStartDate,
          employmentEndDate,
          vacationServiceStartDate,
          createdByActorRef: actorRef,
          updatedByActorRef: actorRef,
        },
      });
      const dto = employeeDto(created);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYEE_CREATE',
        entityType: 'PAYROLL_EMPLOYEE',
        entityId: created.employeeStableId,
        operatorActorRef: actorRef,
        afterJson: toJson({ employerStableId, ...dto }),
      });
      return dto;
    });
  }

  async updateEmployee(
    employeeStableIdRaw: string,
    input: UpdatePayrollEmployeeInput,
    actorRef: string,
  ) {
    const employeeStableId = requirePayrollStableId(
      employeeStableIdRaw,
      'employeeStableId',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.payrollEmployee.findUnique({
        where: { employeeStableId },
      });
      if (!existing) throw new NotFoundException('Payroll employee not found');

      const employmentStartDate =
        input.employmentStartDate === undefined
          ? existing.employmentStartDate
          : parsePayrollDateOnly(
              input.employmentStartDate,
              'employmentStartDate',
            );
      const employmentEndDate =
        input.employmentEndDate === undefined
          ? existing.employmentEndDate
          : (parseOptionalPayrollDateOnly(
              input.employmentEndDate,
              'employmentEndDate',
            ) ?? null);
      const vacationServiceStartDate =
        input.vacationServiceStartDate === undefined
          ? existing.vacationServiceStartDate
          : (parseOptionalPayrollDateOnly(
              input.vacationServiceStartDate,
              'vacationServiceStartDate',
            ) ?? null);
      validateEmploymentDates(
        employmentStartDate,
        employmentEndDate,
        vacationServiceStartDate,
      );

      const updated = await tx.payrollEmployee.update({
        where: { employeeStableId },
        data: {
          ...(input.legalName !== undefined
            ? { legalName: requirePayrollText(input.legalName, 'legalName') }
            : {}),
          ...(input.displayName !== undefined
            ? { displayName: normalizePayrollOptionalText(input.displayName) }
            : {}),
          ...(input.userStableId !== undefined
            ? { userStableId: normalizePayrollOptionalText(input.userStableId) }
            : {}),
          ...(input.storeStableId !== undefined
            ? {
                storeStableId: normalizePayrollOptionalText(
                  input.storeStableId,
                ),
              }
            : {}),
          employmentStartDate,
          employmentEndDate,
          vacationServiceStartDate,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedByActorRef: actorRef,
        },
      });

      const before = employeeDto(existing);
      const after = employeeDto(updated);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYEE_UPDATE',
        entityType: 'PAYROLL_EMPLOYEE',
        entityId: employeeStableId,
        operatorActorRef: actorRef,
        beforeJson: toJson(before),
        afterJson: toJson(after),
      });
      return after;
    });
  }

  async listEmployeeConfigs(employeeStableIdRaw: string) {
    const employeeStableId = requirePayrollStableId(
      employeeStableIdRaw,
      'employeeStableId',
    );
    const employee = await this.prisma.payrollEmployee.findUnique({
      where: { employeeStableId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Payroll employee not found');

    const rows = await this.prisma.payrollEmployeeConfigVersion.findMany({
      where: { employeeId: employee.id },
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    });
    return rows.map(employeeConfigDto);
  }

  async createEmployeeConfig(
    employeeStableIdRaw: string,
    input: CreatePayrollEmployeeConfigInput,
    actorRef: string,
  ) {
    const employeeStableId = requirePayrollStableId(
      employeeStableIdRaw,
      'employeeStableId',
    );
    const effectiveFrom = parsePayrollDateOnly(
      input.effectiveFrom,
      'effectiveFrom',
    );
    const normalized = {
      provinceOfEmployment: requirePayrollText(
        input.provinceOfEmployment,
        'provinceOfEmployment',
      ).toUpperCase(),
      payFrequency: requirePayrollEnum(
        input.payFrequency,
        Object.values(PayrollPayFrequency),
        'payFrequency',
      ),
      payScheduleAnchorDate: parsePayrollDateOnly(
        input.payScheduleAnchorDate,
        'payScheduleAnchorDate',
      ),
      defaultHourlyRateCents: requireNonNegativePayrollInteger(
        input.defaultHourlyRateCents,
        'defaultHourlyRateCents',
      ),
      federalTd1Mode: requirePayrollEnum(
        input.federalTd1Mode,
        Object.values(PayrollTd1Mode),
        'federalTd1Mode',
      ),
      federalTd1TotalClaimCents:
        input.federalTd1TotalClaimCents == null
          ? null
          : requireNonNegativePayrollInteger(
              input.federalTd1TotalClaimCents,
              'federalTd1TotalClaimCents',
            ),
      ontarioTd1Mode: requirePayrollEnum(
        input.ontarioTd1Mode,
        Object.values(PayrollTd1Mode),
        'ontarioTd1Mode',
      ),
      ontarioTd1TotalClaimCents:
        input.ontarioTd1TotalClaimCents == null
          ? null
          : requireNonNegativePayrollInteger(
              input.ontarioTd1TotalClaimCents,
              'ontarioTd1TotalClaimCents',
            ),
      incomeTaxTreatment: requirePayrollEnum(
        input.incomeTaxTreatment,
        Object.values(PayrollIncomeTaxTreatment),
        'incomeTaxTreatment',
      ),
      additionalTaxPerPayCents: requireNonNegativePayrollInteger(
        input.additionalTaxPerPayCents ?? 0,
        'additionalTaxPerPayCents',
      ),
      cppTreatment: requirePayrollEnum(
        input.cppTreatment,
        Object.values(PayrollCppTreatment),
        'cppTreatment',
      ),
      cppExceptionCode:
        normalizePayrollOptionalText(input.cppExceptionCode) ?? null,
      cppExceptionNote:
        normalizePayrollOptionalText(input.cppExceptionNote) ?? null,
      eiTreatment: requirePayrollEnum(
        input.eiTreatment,
        Object.values(PayrollEiTreatment),
        'eiTreatment',
      ),
      eiExceptionCode:
        normalizePayrollOptionalText(input.eiExceptionCode) ?? null,
      eiExceptionNote:
        normalizePayrollOptionalText(input.eiExceptionNote) ?? null,
      vacationTreatment: requirePayrollEnum(
        input.vacationTreatment,
        Object.values(PayrollVacationTreatment),
        'vacationTreatment',
      ),
      vacationRateBasisPoints: requireNonNegativePayrollInteger(
        input.vacationRateBasisPoints,
        'vacationRateBasisPoints',
      ),
      vacationAgreementConfirmedAt:
        parseOptionalPayrollTimestamp(
          input.vacationAgreementConfirmedAt,
          'vacationAgreementConfirmedAt',
        ) ?? null,
      vacationAgreementNote:
        normalizePayrollOptionalText(input.vacationAgreementNote) ?? null,
      calculationProfileVersion: PAYROLL_CALCULATION_PROFILE_VERSION,
    };

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const employee = await tx.payrollEmployee.findUnique({
        where: { employeeStableId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Payroll employee not found');

      const duplicate = await tx.payrollEmployeeConfigVersion.findUnique({
        where: {
          employeeId_effectiveFrom: {
            employeeId: employee.id,
            effectiveFrom,
          },
        },
        select: { configStableId: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'Payroll employee already has a config for effectiveFrom',
        );
      }

      const latest = await tx.payrollEmployeeConfigVersion.findFirst({
        where: { employeeId: employee.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      try {
        assertPayrollEmployeeConfig({ version, ...normalized });
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid payroll config',
        );
      }

      const created = await tx.payrollEmployeeConfigVersion.create({
        data: {
          employeeId: employee.id,
          version,
          effectiveFrom,
          ...normalized,
          createdByActorRef: actorRef,
        },
      });
      const dto = employeeConfigDto(created);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYEE_CONFIG_CREATE',
        entityType: 'PAYROLL_EMPLOYEE_CONFIG',
        entityId: created.configStableId,
        operatorActorRef: actorRef,
        afterJson: toJson({ employeeStableId, ...dto }),
      });
      return dto;
    });
  }
}
