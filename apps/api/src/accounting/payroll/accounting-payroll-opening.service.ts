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
import { assertPayrollYearOpening } from './payroll-policy';
import type { UpsertPayrollYearOpeningInput } from './payroll-lifecycle.contracts';
import {
  parsePayrollDateOnly,
  payrollDateOnly,
  requireNonNegativePayrollInteger,
  requirePayrollStableId,
  requirePayrollText,
} from './payroll-lifecycle-input';

const toJson = (value: unknown): AccountingJsonValue =>
  value as AccountingJsonValue;

const openingDto = (row: {
  openingStableId: string;
  taxYear: number;
  asOfDate: Date;
  grossEarningsYtdCents: number;
  netPayYtdCents: number;
  periodicEarningsYtdCents: number;
  nonPeriodicEarningsYtdCents: number;
  pensionableEarningsYtdCents: number;
  employeeCppYtdCents: number;
  employeeCpp2YtdCents: number;
  insurableEarningsYtdCents: number;
  employeeEiYtdCents: number;
  incomeTaxYtdCents: number;
  nonPeriodicCppBaseContributionYtdCents: number;
  nonPeriodicCppAdditionalDeductionYtdCents: number;
  nonPeriodicEiPremiumYtdCents: number;
  vacationPayPaidYtdCents: number;
  vacationPayAccruedYtdCents: number;
  sourceNote: string;
  version: number;
  confirmedByActorRef: string;
  confirmedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  openingStableId: row.openingStableId,
  taxYear: row.taxYear,
  asOfDate: payrollDateOnly(row.asOfDate),
  grossEarningsYtdCents: row.grossEarningsYtdCents,
  netPayYtdCents: row.netPayYtdCents,
  periodicEarningsYtdCents: row.periodicEarningsYtdCents,
  nonPeriodicEarningsYtdCents: row.nonPeriodicEarningsYtdCents,
  pensionableEarningsYtdCents: row.pensionableEarningsYtdCents,
  employeeCppYtdCents: row.employeeCppYtdCents,
  employeeCpp2YtdCents: row.employeeCpp2YtdCents,
  insurableEarningsYtdCents: row.insurableEarningsYtdCents,
  employeeEiYtdCents: row.employeeEiYtdCents,
  incomeTaxYtdCents: row.incomeTaxYtdCents,
  nonPeriodicCppBaseContributionYtdCents:
    row.nonPeriodicCppBaseContributionYtdCents,
  nonPeriodicCppAdditionalDeductionYtdCents:
    row.nonPeriodicCppAdditionalDeductionYtdCents,
  nonPeriodicEiPremiumYtdCents: row.nonPeriodicEiPremiumYtdCents,
  vacationPayPaidYtdCents: row.vacationPayPaidYtdCents,
  vacationPayAccruedYtdCents: row.vacationPayAccruedYtdCents,
  sourceNote: row.sourceNote,
  version: row.version,
  confirmedByActorRef: row.confirmedByActorRef,
  confirmedAt: row.confirmedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class AccountingPayrollOpeningService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async getYearOpening(employeeStableIdRaw: string, taxYear: number) {
    const employeeStableId = requirePayrollStableId(
      employeeStableIdRaw,
      'employeeStableId',
    );
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 9999) {
      throw new BadRequestException('taxYear must be a four-digit year');
    }

    const employee = await this.prisma.payrollEmployee.findUnique({
      where: { employeeStableId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Payroll employee not found');

    const row = await this.prisma.payrollEmployeeYearOpening.findUnique({
      where: { employeeId_taxYear: { employeeId: employee.id, taxYear } },
    });
    return row ? openingDto(row) : null;
  }

  async upsertYearOpening(
    employeeStableIdRaw: string,
    taxYear: number,
    input: UpsertPayrollYearOpeningInput,
    actorRef: string,
  ) {
    const employeeStableId = requirePayrollStableId(
      employeeStableIdRaw,
      'employeeStableId',
    );
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 9999) {
      throw new BadRequestException('taxYear must be a four-digit year');
    }

    const asOfDate = parsePayrollDateOnly(input.asOfDate, 'asOfDate');
    if (asOfDate.getUTCFullYear() !== taxYear) {
      throw new BadRequestException('asOfDate must be inside taxYear');
    }

    const sourceNote = requirePayrollText(input.sourceNote, 'sourceNote');
    const amounts = {
      grossEarningsYtdCents: requireNonNegativePayrollInteger(
        input.grossEarningsYtdCents,
        'grossEarningsYtdCents',
      ),
      netPayYtdCents: requireNonNegativePayrollInteger(
        input.netPayYtdCents,
        'netPayYtdCents',
      ),
      periodicEarningsYtdCents: requireNonNegativePayrollInteger(
        input.periodicEarningsYtdCents,
        'periodicEarningsYtdCents',
      ),
      nonPeriodicEarningsYtdCents: requireNonNegativePayrollInteger(
        input.nonPeriodicEarningsYtdCents,
        'nonPeriodicEarningsYtdCents',
      ),
      pensionableEarningsYtdCents: requireNonNegativePayrollInteger(
        input.pensionableEarningsYtdCents,
        'pensionableEarningsYtdCents',
      ),
      employeeCppYtdCents: requireNonNegativePayrollInteger(
        input.employeeCppYtdCents,
        'employeeCppYtdCents',
      ),
      employeeCpp2YtdCents: requireNonNegativePayrollInteger(
        input.employeeCpp2YtdCents,
        'employeeCpp2YtdCents',
      ),
      insurableEarningsYtdCents: requireNonNegativePayrollInteger(
        input.insurableEarningsYtdCents,
        'insurableEarningsYtdCents',
      ),
      employeeEiYtdCents: requireNonNegativePayrollInteger(
        input.employeeEiYtdCents,
        'employeeEiYtdCents',
      ),
      incomeTaxYtdCents: requireNonNegativePayrollInteger(
        input.incomeTaxYtdCents,
        'incomeTaxYtdCents',
      ),
      nonPeriodicCppBaseContributionYtdCents: requireNonNegativePayrollInteger(
        input.nonPeriodicCppBaseContributionYtdCents,
        'nonPeriodicCppBaseContributionYtdCents',
      ),
      nonPeriodicCppAdditionalDeductionYtdCents:
        requireNonNegativePayrollInteger(
          input.nonPeriodicCppAdditionalDeductionYtdCents,
          'nonPeriodicCppAdditionalDeductionYtdCents',
        ),
      nonPeriodicEiPremiumYtdCents: requireNonNegativePayrollInteger(
        input.nonPeriodicEiPremiumYtdCents,
        'nonPeriodicEiPremiumYtdCents',
      ),
      vacationPayPaidYtdCents: requireNonNegativePayrollInteger(
        input.vacationPayPaidYtdCents,
        'vacationPayPaidYtdCents',
      ),
      vacationPayAccruedYtdCents: requireNonNegativePayrollInteger(
        input.vacationPayAccruedYtdCents,
        'vacationPayAccruedYtdCents',
      ),
    };

    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const employee = await tx.payrollEmployee.findUnique({
        where: { employeeStableId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Payroll employee not found');

      const yearStart = new Date(Date.UTC(taxYear, 0, 1));
      const nextYearStart = new Date(Date.UTC(taxYear + 1, 0, 1));
      const approved = await tx.payrollRun.findFirst({
        where: {
          employeeId: employee.id,
          payDate: { gte: yearStart, lt: nextYearStart },
          approvedAt: { not: null },
        },
        select: { runStableId: true },
      });
      if (approved) {
        throw new ConflictException(
          'year opening is frozen after the first approved payroll run',
        );
      }

      const existing = await tx.payrollEmployeeYearOpening.findUnique({
        where: { employeeId_taxYear: { employeeId: employee.id, taxYear } },
      });
      const version = (existing?.version ?? 0) + 1;

      try {
        assertPayrollYearOpening({
          taxYear,
          ...amounts,
          sourceNote,
          version,
        });
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'invalid year opening',
        );
      }

      const confirmedAt = new Date();
      const saved = existing
        ? await tx.payrollEmployeeYearOpening.update({
            where: { id: existing.id },
            data: {
              asOfDate,
              ...amounts,
              sourceNote,
              version,
              confirmedByActorRef: actorRef,
              confirmedAt,
              updatedByActorRef: actorRef,
            },
          })
        : await tx.payrollEmployeeYearOpening.create({
            data: {
              employeeId: employee.id,
              taxYear,
              asOfDate,
              ...amounts,
              sourceNote,
              version,
              confirmedByActorRef: actorRef,
              confirmedAt,
              updatedByActorRef: actorRef,
            },
          });

      const before = existing ? openingDto(existing) : null;
      const after = openingDto(saved);
      await writeAccountingAuditLog(tx, {
        action: existing
          ? 'PAYROLL_YEAR_OPENING_UPDATE'
          : 'PAYROLL_YEAR_OPENING_CREATE',
        entityType: 'PAYROLL_YEAR_OPENING',
        entityId: saved.openingStableId,
        operatorActorRef: actorRef,
        beforeJson: before ? toJson(before) : undefined,
        afterJson: toJson({ employeeStableId, ...after }),
      });
      return after;
    });
  }
}
