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
import { PayrollRunStatus } from './payroll-contracts';
import type { PayrollCalculationYtdInput } from './payroll-calculator.contracts';
import { aggregatePayrollYtd } from './payroll-ytd';
import { requirePayrollStableId } from './payroll-lifecycle-input';

type PayrollDbClient = AccountingDb | AccountingTransactionClient;

const beginningOfYear = (year: number): Date => new Date(Date.UTC(year, 0, 1));

@Injectable()
export class AccountingPayrollYtdService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async deriveForEmployeeId(
    db: PayrollDbClient,
    employeeId: string,
    taxYear: number,
    beforePayDate?: Date,
  ): Promise<PayrollCalculationYtdInput> {
    if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 9999) {
      throw new BadRequestException('taxYear must be a four-digit year');
    }

    const yearStart = beginningOfYear(taxYear);
    const nextYearStart = beginningOfYear(taxYear + 1);
    const opening = await db.payrollEmployeeYearOpening.findUnique({
      where: { employeeId_taxYear: { employeeId, taxYear } },
    });
    if (opening && beforePayDate && opening.asOfDate >= beforePayDate) {
      throw new ConflictException(
        'Payroll year opening asOfDate must be before the run payDate',
      );
    }

    const finalizedRuns = await db.payrollRun.findMany({
      where: {
        employeeId,
        payDate: {
          gte: yearStart,
          lt: beforePayDate ?? nextYearStart,
        },
        status: {
          in: [
            PayrollRunStatus.APPROVED,
            PayrollRunStatus.POSTED,
            PayrollRunStatus.REVERSED,
          ],
        },
      },
      orderBy: [{ payDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        runStableId: true,
        status: true,
        reversalJournalEntryStableId: true,
        reversedAt: true,
        grossPayCents: true,
        netPayCents: true,
        periodicTaxableEarningsCents: true,
        nonPeriodicTaxableEarningsCents: true,
        pensionableEarningsCents: true,
        employeeCppCents: true,
        employeeCpp2Cents: true,
        insurableEarningsCents: true,
        employeeEiCents: true,
        incomeTaxCents: true,
        vacationPayPaidCents: true,
        vacationPayAccruedCents: true,
        calculationOutputJson: true,
      },
    });

    try {
      return aggregatePayrollYtd(opening, finalizedRuns);
    } catch (error) {
      throw new ConflictException(
        error instanceof Error
          ? error.message
          : 'canonical payroll YTD cannot be derived',
      );
    }
  }

  async getEmployeeYtd(employeeStableIdRaw: string, taxYear: number) {
    const employeeStableId = requirePayrollStableId(
      employeeStableIdRaw,
      'employeeStableId',
    );
    const employee = await this.prisma.payrollEmployee.findUnique({
      where: { employeeStableId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Payroll employee not found');

    const ytd = await this.deriveForEmployeeId(
      this.prisma,
      employee.id,
      taxYear,
    );
    return { employeeStableId, taxYear, ytd };
  }
}
