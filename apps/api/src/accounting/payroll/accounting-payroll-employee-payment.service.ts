import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ACCOUNTING_DB, type AccountingDb } from '../accounting-db';
import { runSerializableAccountingWrite } from '../accounting-atomic-write';
import { writeAccountingAuditLog } from '../accounting-audit-writer';
import { AccountingJournalService } from '../accounting-journal.service';
import { AccountingJournalPolicyError } from '../accounting-journal-policy';
import {
  buildPayrollEmployeePaymentWritePlan,
  PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
  type PayrollEmployeePaymentAccountFact,
} from './payroll-employee-payment-journal-authority';
import {
  normalizePayrollOptionalText,
  parsePayrollDateOnly,
  payrollDateOnly,
  requirePayrollStableId,
} from './payroll-lifecycle-input';
import type { CreatePayrollEmployeePaymentInput } from './payroll-lifecycle.contracts';
import {
  payrollEmployeePaymentDto,
  type PayrollEmployeePaymentViewRecord,
} from './payroll-employee-payment-presenter';
import { PayrollRunStatus } from './payroll-contracts';
import { payrollJsonValue } from './payroll-run-persistence';

const SETTLEMENT_ATTEMPTS = 2;

const PAYMENT_INCLUDE = {
  run: { select: { runStableId: true } },
} as const;

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 'P2002';

const sameDate = (left: Date, right: Date): boolean =>
  left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);

@Injectable()
export class AccountingPayrollEmployeePaymentService {
  constructor(
    @Inject(ACCOUNTING_DB) private readonly prisma: AccountingDb,
    private readonly journal: AccountingJournalService,
  ) {}

  async getForRun(runStableIdRaw: string) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');
    const run = await this.prisma.payrollRun.findUnique({
      where: { runStableId },
      select: { id: true },
    });
    if (!run) throw new NotFoundException('Payroll run not found');
    const row = await this.prisma.payrollEmployeePayment.findUnique({
      where: { runId: run.id },
      include: PAYMENT_INCLUDE,
    });
    return row
      ? payrollEmployeePaymentDto(row as PayrollEmployeePaymentViewRecord)
      : null;
  }

  async settleRun(
    runStableIdRaw: string,
    input: CreatePayrollEmployeePaymentInput,
    actorRef: string,
  ) {
    const runStableId = requirePayrollStableId(runStableIdRaw, 'runStableId');
    const paymentAccountStableId = requirePayrollStableId(
      input.paymentAccountStableId,
      'paymentAccountStableId',
    );
    const paymentDate = parsePayrollDateOnly(input.paymentDate, 'paymentDate');
    const reference = normalizePayrollOptionalText(input.reference) ?? null;

    let lastError: unknown;
    for (let attempt = 0; attempt < SETTLEMENT_ATTEMPTS; attempt += 1) {
      try {
        return await this.settleOnce({
          runStableId,
          paymentAccountStableId,
          paymentDate,
          reference,
          actorRef,
        });
      } catch (error) {
        lastError = error;
        if (!isUniqueConstraintError(error)) throw error;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new ConflictException('Payroll employee payment retry exhausted');
  }

  private async settleOnce(input: {
    runStableId: string;
    paymentAccountStableId: string;
    paymentDate: Date;
    reference: string | null;
    actorRef: string;
  }) {
    return runSerializableAccountingWrite(this.prisma, async (tx) => {
      const run = await tx.payrollRun.findUnique({
        where: { runStableId: input.runStableId },
        select: {
          id: true,
          runStableId: true,
          status: true,
          calculationHash: true,
          postedJournalEntryStableId: true,
          postedAt: true,
          storeStableId: true,
          payDate: true,
          netPayCents: true,
        },
      });
      if (!run) throw new NotFoundException('Payroll run not found');
      if (run.status !== PayrollRunStatus.POSTED) {
        throw new ConflictException(
          'Employee payment requires a POSTED Payroll run',
        );
      }
      if (
        !run.calculationHash ||
        !run.postedJournalEntryStableId ||
        !run.postedAt ||
        run.netPayCents === null
      ) {
        throw new ConflictException(
          'POSTED Payroll run is missing frozen accrual evidence',
        );
      }
      if (run.netPayCents <= 0) {
        throw new ConflictException(
          'Payroll run has no positive employee net-pay liability to settle',
        );
      }
      if (input.paymentDate.getTime() < run.payDate.getTime()) {
        throw new ConflictException(
          'Employee payment date cannot be before the Payroll pay date',
        );
      }

      const existing = await tx.payrollEmployeePayment.findUnique({
        where: { runId: run.id },
        include: PAYMENT_INCLUDE,
      });
      if (existing) {
        if (
          existing.paymentAccountStableId !== input.paymentAccountStableId ||
          !sameDate(existing.paymentDate, input.paymentDate) ||
          existing.reference !== input.reference ||
          existing.amountCents !== run.netPayCents ||
          existing.currency !== 'CAD'
        ) {
          throw new ConflictException(
            'Payroll run already has a different employee payment settlement',
          );
        }
        if (!existing.journalEntryStableId) {
          throw new ConflictException(
            'Payroll employee payment is missing its Journal evidence',
          );
        }
        return payrollEmployeePaymentDto(
          existing as PayrollEmployeePaymentViewRecord,
        );
      }

      const created = await tx.payrollEmployeePayment.create({
        data: {
          runId: run.id,
          paymentAccountStableId: input.paymentAccountStableId,
          amountCents: run.netPayCents,
          currency: 'CAD',
          paymentDate: input.paymentDate,
          reference: input.reference,
          createdByActorRef: input.actorRef,
        },
        include: PAYMENT_INCLUDE,
      });

      const accountRows = await tx.accountingAccount.findMany({
        where: {
          accountStableId: {
            in: [
              PAYROLL_NET_PAY_PAYABLE_ACCOUNT_STABLE_ID,
              input.paymentAccountStableId,
            ],
          },
        },
        select: {
          accountStableId: true,
          accountClass: true,
          type: true,
          currency: true,
          isActive: true,
        },
      });
      const accountFacts: PayrollEmployeePaymentAccountFact[] = accountRows.map(
        (account) => ({
          accountStableId: account.accountStableId,
          accountClass: account.accountClass,
          accountType: account.type,
          currency: account.currency,
          isActive: account.isActive,
        }),
      );

      let plan: ReturnType<typeof buildPayrollEmployeePaymentWritePlan>;
      try {
        plan = buildPayrollEmployeePaymentWritePlan({
          fact: {
            paymentStableId: created.paymentStableId,
            runStableId: run.runStableId,
            calculationHash: run.calculationHash,
            postedAccrualJournalEntryStableId: run.postedJournalEntryStableId,
            storeStableId: run.storeStableId,
            paymentDate: payrollDateOnly(input.paymentDate)!,
            paymentAccountStableId: input.paymentAccountStableId,
            amountCents: run.netPayCents,
          },
          accountFacts,
        });
      } catch (error) {
        if (error instanceof AccountingJournalPolicyError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }

      const journal =
        await this.journal.createPayrollEmployeePaymentJournalInTx(
          plan.journal,
          input.actorRef,
          plan.authority,
          tx,
        );

      const updated = await tx.payrollEmployeePayment.update({
        where: { id: created.id },
        data: { journalEntryStableId: journal.entryStableId },
        include: PAYMENT_INCLUDE,
      });
      const after = payrollEmployeePaymentDto(
        updated as PayrollEmployeePaymentViewRecord,
      );
      await writeAccountingAuditLog(tx, {
        action: 'PAYROLL_EMPLOYEE_PAYMENT_POST',
        entityType: 'PAYROLL_EMPLOYEE_PAYMENT',
        entityId: created.paymentStableId,
        operatorActorRef: input.actorRef,
        beforeJson: null,
        afterJson: payrollJsonValue(after),
      });
      return after;
    });
  }
}
