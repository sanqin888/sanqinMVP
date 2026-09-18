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
import {
  buildPayrollCraRemittancePreview,
  type PayrollCraRemittancePreviewV1,
  type PayrollCraRemittanceRunEvidenceV1,
} from './payroll-cra-remittance-evidence';
import {
  parsePayrollDateOnly,
  payrollDateOnly,
  requirePayrollStableId,
} from './payroll-lifecycle-input';
import { derivePayrollCraRemittancePeriod } from './payroll-remittance-policy';
import {
  PayrollRunStatus,
  type PayrollRemitterType,
} from './payroll-contracts';

type PayrollDbClient = AccountingDb | AccountingTransactionClient;

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
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async preview(employerStableIdRaw: string, anchorDateRaw: string) {
    const employerStableId = requirePayrollStableId(
      employerStableIdRaw,
      'employerStableId',
    );
    const anchorDate = parsePayrollDateOnly(anchorDateRaw, 'anchorDate');
    return this.buildPreview(this.prisma, employerStableId, anchorDate);
  }

  async buildPreview(
    db: PayrollDbClient,
    employerStableId: string,
    anchorDate: Date,
  ): Promise<PayrollCraRemittancePreviewV1> {
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
    const periodStart = parsePayrollDateOnly(target.periodStart, 'periodStart');
    const periodEnd = parsePayrollDateOnly(target.periodEnd, 'periodEnd');

    const candidates = await db.payrollRun.findMany({
      where: {
        employerId: employer.id,
        status: PayrollRunStatus.POSTED,
        payDate: { gte: periodStart, lte: periodEnd },
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
        runPeriod.remitterType !== target.remitterType ||
        runPeriod.periodStart !== target.periodStart ||
        runPeriod.periodEnd !== target.periodEnd
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
        employerStableId: employer.employerStableId,
        remitterType: target.remitterType,
        remittancePolicyVersion: target.remittancePolicyVersion,
        periodStart: target.periodStart,
        periodEnd: target.periodEnd,
        dueDate: target.dueDate,
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
}
