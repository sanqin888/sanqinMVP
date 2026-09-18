import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACCOUNTING_DB, type AccountingDb } from '../accounting-db';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import {
  PAYROLL_PAY_STATEMENT_TEMPLATE_VERSION,
  PayrollRunStatus,
} from './payroll-contracts';
import {
  payrollDateOnly,
  requirePayrollStableId,
} from './payroll-lifecycle-input';
import {
  renderPayrollPayStatementPdf,
  type PayrollPayStatementSnapshot,
  type PayrollPayStatementYtd,
} from './payroll-pay-statement';

const FINALIZED_STATEMENT_STATUSES = new Set<string>([
  PayrollRunStatus.APPROVED,
  PayrollRunStatus.POSTED,
  PayrollRunStatus.REVERSED,
]);

const requireAmount = (
  value: number | null,
  field: string,
  runStableId: string,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ConflictException(
      'PayrollRun ' + runStableId + ' is missing valid ' + field,
    );
  }
  return value as number;
};

const requireYtdAmount = (
  source: Record<string, unknown>,
  field: keyof PayrollPayStatementYtd,
  runStableId: string,
): number => {
  const value = source[field];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ConflictException(
      'PayrollRun ' + runStableId + ' has invalid frozen YTD field ' + field,
    );
  }
  return value as number;
};

const readPayStatementYtd = (
  raw: unknown,
  runStableId: string,
): PayrollPayStatementYtd => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConflictException(
      'PayrollRun ' + runStableId + ' is missing frozen YTD evidence',
    );
  }
  const source = raw as Record<string, unknown>;
  return {
    grossEarningsYtdCents: requireYtdAmount(
      source,
      'grossEarningsYtdCents',
      runStableId,
    ),
    netPayYtdCents: requireYtdAmount(source, 'netPayYtdCents', runStableId),
    pensionableEarningsYtdCents: requireYtdAmount(
      source,
      'pensionableEarningsYtdCents',
      runStableId,
    ),
    employeeCppYtdCents: requireYtdAmount(
      source,
      'employeeCppYtdCents',
      runStableId,
    ),
    employeeCpp2YtdCents: requireYtdAmount(
      source,
      'employeeCpp2YtdCents',
      runStableId,
    ),
    insurableEarningsYtdCents: requireYtdAmount(
      source,
      'insurableEarningsYtdCents',
      runStableId,
    ),
    employeeEiYtdCents: requireYtdAmount(
      source,
      'employeeEiYtdCents',
      runStableId,
    ),
    incomeTaxYtdCents: requireYtdAmount(
      source,
      'incomeTaxYtdCents',
      runStableId,
    ),
    vacationPayPaidYtdCents: requireYtdAmount(
      source,
      'vacationPayPaidYtdCents',
      runStableId,
    ),
    vacationPayAccruedYtdCents: requireYtdAmount(
      source,
      'vacationPayAccruedYtdCents',
      runStableId,
    ),
  };
};

@Injectable()
export class AccountingPayrollPayStatementService {
  constructor(@Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb) {}

  async render(runStableIdRaw: string, actorRef: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');
    const run = await this.prisma.payrollRun.findUnique({
      where: { runStableId },
      include: {
        employer: {
          select: {
            employerStableId: true,
            legalName: true,
            displayName: true,
          },
        },
        employee: {
          select: {
            employeeStableId: true,
            legalName: true,
            displayName: true,
          },
        },
        employeeConfig: {
          select: {
            payFrequency: true,
          },
        },
      },
    });
    if (!run) throw new NotFoundException('Payroll run not found');

    if (!FINALIZED_STATEMENT_STATUSES.has(run.status)) {
      throw new ConflictException(
        'Pay statement PDF is available only for finalized Payroll runs',
      );
    }
    if (
      run.payStatementTemplateVersion !== PAYROLL_PAY_STATEMENT_TEMPLATE_VERSION
    ) {
      throw new ConflictException(
        'Payroll run does not have the supported frozen pay-statement template version',
      );
    }
    if (!run.approvedAt) {
      throw new ConflictException(
        'Payroll run is missing approval evidence required for pay statement',
      );
    }
    if (!run.employeeConfig) {
      throw new ConflictException(
        'Payroll run is missing its frozen employee configuration',
      );
    }

    const snapshot: PayrollPayStatementSnapshot = {
      statementNumber: 'PS-' + run.runStableId,
      templateVersion: run.payStatementTemplateVersion,
      employerName: run.employer.displayName ?? run.employer.legalName,
      employeeName: run.employee.displayName ?? run.employee.legalName,
      runStableId: run.runStableId,
      payFrequency: run.employeeConfig.payFrequency,
      periodStart: payrollDateOnly(run.periodStart) ?? '',
      periodEnd: payrollDateOnly(run.periodEnd) ?? '',
      payDate: payrollDateOnly(run.payDate) ?? '',
      approvedAt: run.approvedAt,
      regularMinutes: run.regularMinutes,
      regularHourlyRateCents: run.regularHourlyRateCents,
      overtimeMinutes: run.overtimeMinutes,
      overtimeHourlyRateCents: run.overtimeHourlyRateCents,
      regularPayCents: requireAmount(
        run.regularPayCents,
        'regularPayCents',
        run.runStableId,
      ),
      overtimePayCents: requireAmount(
        run.overtimePayCents,
        'overtimePayCents',
        run.runStableId,
      ),
      vacationPayPaidCents: requireAmount(
        run.vacationPayPaidCents,
        'vacationPayPaidCents',
        run.runStableId,
      ),
      vacationPayAccruedCents: requireAmount(
        run.vacationPayAccruedCents,
        'vacationPayAccruedCents',
        run.runStableId,
      ),
      grossPayCents: requireAmount(
        run.grossPayCents,
        'grossPayCents',
        run.runStableId,
      ),
      incomeTaxCents: requireAmount(
        run.incomeTaxCents,
        'incomeTaxCents',
        run.runStableId,
      ),
      employeeCppCents: requireAmount(
        run.employeeCppCents,
        'employeeCppCents',
        run.runStableId,
      ),
      employeeCpp2Cents: requireAmount(
        run.employeeCpp2Cents,
        'employeeCpp2Cents',
        run.runStableId,
      ),
      employeeEiCents: requireAmount(
        run.employeeEiCents,
        'employeeEiCents',
        run.runStableId,
      ),
      totalEmployeeDeductionsCents: requireAmount(
        run.totalEmployeeDeductionsCents,
        'totalEmployeeDeductionsCents',
        run.runStableId,
      ),
      netPayCents: requireAmount(
        run.netPayCents,
        'netPayCents',
        run.runStableId,
      ),
      ytd: readPayStatementYtd(run.ytdAfterJson, run.runStableId),
    };

    const buffer = await renderPayrollPayStatementPdf(snapshot);
    await writeAccountingAuditLog(this.prisma, {
      action: 'PAYROLL_PAY_STATEMENT_EXPORT',
      entityType: 'PAYROLL_RUN',
      entityId: run.runStableId,
      operatorActorRef: actorRef,
      afterJson: {
        payStatementTemplateVersion: run.payStatementTemplateVersion,
      },
    });

    return {
      filename: 'pay-statement-' + run.runStableId + '.pdf',
      buffer,
    };
  }
}
