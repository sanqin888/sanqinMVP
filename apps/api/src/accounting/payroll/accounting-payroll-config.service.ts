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
import { PayrollRemitterType } from './payroll-contracts';
import { assertPayrollEmployerConfig } from './payroll-policy';
import type {
  CreatePayrollEmployerConfigInput,
  CreatePayrollEmployerInput,
  UpdatePayrollEmployerInput,
} from './payroll-lifecycle.contracts';
import {
  normalizePayrollOptionalText,
  parsePayrollDateOnly,
  payrollDateOnly,
  requirePayrollEnum,
  requirePayrollStableId,
  requirePayrollText,
  requirePositivePayrollInteger,
} from './payroll-lifecycle-input';

const toJson = (value: unknown): AccountingJsonValue =>
  value as AccountingJsonValue;

const employerDto = (row: {
  employerStableId: string;
  legalName: string;
  displayName: string | null;
  defaultStoreStableId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  employerStableId: row.employerStableId,
  legalName: row.legalName,
  displayName: row.displayName,
  defaultStoreStableId: row.defaultStoreStableId,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const employerConfigDto = (row: {
  configStableId: string;
  version: number;
  effectiveFrom: Date;
  remitterType: string;
  eiEmployerMultiplierMicros: number;
  createdAt: Date;
}) => ({
  configStableId: row.configStableId,
  version: row.version,
  effectiveFrom: payrollDateOnly(row.effectiveFrom),
  remitterType: row.remitterType,
  eiEmployerMultiplierMicros: row.eiEmployerMultiplierMicros,
  createdAt: row.createdAt.toISOString(),
});

@Injectable()
export class AccountingPayrollConfigService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async listEmployers(includeInactive = false) {
    const rows = await this.prisma.payrollEmployer.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { legalName: 'asc' }],
    });
    return rows.map(employerDto);
  }

  async createEmployer(input: CreatePayrollEmployerInput, actorRef: string) {
    const legalName = requirePayrollText(input.legalName, 'legalName');
    const displayName = normalizePayrollOptionalText(input.displayName) ?? null;
    const defaultStoreStableId =
      normalizePayrollOptionalText(input.defaultStoreStableId) ?? null;

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const created = await tx.payrollEmployer.create({
        data: {
          legalName,
          displayName,
          defaultStoreStableId,
          createdByActorRef: actorRef,
          updatedByActorRef: actorRef,
        },
      });
      const dto = employerDto(created);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYER_CREATE',
        entityType: 'PAYROLL_EMPLOYER',
        entityId: created.employerStableId,
        operatorActorRef: actorRef,
        afterJson: toJson(dto),
      });
      return dto;
    });
  }

  async updateEmployer(
    employerStableIdRaw: string,
    input: UpdatePayrollEmployerInput,
    actorRef: string,
  ) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const existing = await tx.payrollEmployer.findUnique({
        where: { employerStableId },
      });
      if (!existing) throw new NotFoundException('Payroll employer not found');

      const updated = await tx.payrollEmployer.update({
        where: { employerStableId },
        data: {
          ...(input.legalName !== undefined
            ? { legalName: requirePayrollText(input.legalName, 'legalName') }
            : {}),
          ...(input.displayName !== undefined
            ? { displayName: normalizePayrollOptionalText(input.displayName) }
            : {}),
          ...(input.defaultStoreStableId !== undefined
            ? {
                defaultStoreStableId: normalizePayrollOptionalText(
                  input.defaultStoreStableId,
                ),
              }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedByActorRef: actorRef,
        },
      });
      const before = employerDto(existing);
      const after = employerDto(updated);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYER_UPDATE',
        entityType: 'PAYROLL_EMPLOYER',
        entityId: employerStableId,
        operatorActorRef: actorRef,
        beforeJson: toJson(before),
        afterJson: toJson(after),
      });
      return after;
    });
  }

  async listEmployerConfigs(employerStableIdRaw: string) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const employer = await this.prisma.payrollEmployer.findUnique({
      where: { employerStableId },
      select: { id: true },
    });
    if (!employer) throw new NotFoundException('Payroll employer not found');

    const rows = await this.prisma.payrollEmployerConfigVersion.findMany({
      where: { employerId: employer.id },
      orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
    });
    return rows.map(employerConfigDto);
  }

  async createEmployerConfig(
    employerStableIdRaw: string,
    input: CreatePayrollEmployerConfigInput,
    actorRef: string,
  ) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const effectiveFrom = parsePayrollDateOnly(
      input.effectiveFrom,
      'effectiveFrom',
    );
    const remitterType = requirePayrollEnum(
      input.remitterType,
      Object.values(PayrollRemitterType),
      'remitterType',
    );
    const eiEmployerMultiplierMicros = requirePositivePayrollInteger(
      input.eiEmployerMultiplierMicros,
      'eiEmployerMultiplierMicros',
    );

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const employer = await tx.payrollEmployer.findUnique({
        where: { employerStableId },
        select: { id: true },
      });
      if (!employer) throw new NotFoundException('Payroll employer not found');

      const existingDate = await tx.payrollEmployerConfigVersion.findUnique({
        where: {
          employerId_effectiveFrom: {
            employerId: employer.id,
            effectiveFrom,
          },
        },
        select: { configStableId: true },
      });
      if (existingDate) {
        throw new ConflictException(
          'Payroll employer already has a config for effectiveFrom',
        );
      }

      const latest = await tx.payrollEmployerConfigVersion.findFirst({
        where: { employerId: employer.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      try {
        assertPayrollEmployerConfig({
          version,
          remitterType,
          eiEmployerMultiplierMicros,
        });
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid payroll config',
        );
      }

      const created = await tx.payrollEmployerConfigVersion.create({
        data: {
          employerId: employer.id,
          version,
          effectiveFrom,
          remitterType,
          eiEmployerMultiplierMicros,
          createdByActorRef: actorRef,
        },
      });
      const dto = employerConfigDto(created);
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYER_CONFIG_CREATE',
        entityType: 'PAYROLL_EMPLOYER_CONFIG',
        entityId: created.configStableId,
        operatorActorRef: actorRef,
        afterJson: toJson({ employerStableId, ...dto }),
      });
      return dto;
    });
  }
}
