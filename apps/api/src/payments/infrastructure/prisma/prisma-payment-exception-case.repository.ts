import { Injectable } from '@nestjs/common';
import { Prisma, type PaymentExceptionCase as CaseRow } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  PaymentExceptionCase,
  PaymentExceptionCaseRepository,
  PaymentExceptionDecisionInput,
  PaymentExceptionOpenInput,
} from '../../application/payment-exception-case.repository';

const toCase = (row: CaseRow): PaymentExceptionCase => ({
  caseStableId: row.caseStableId,
  attemptId: row.attemptId,
  storeStableId: row.storeStableId,
  paymentTransactionId: row.paymentTransactionId,
  externalPaymentId: row.externalPaymentId,
  amountCents: row.amountCents,
  currency: row.currency,
  action: row.action as PaymentExceptionCase['action'],
  mode: row.mode as PaymentExceptionCase['mode'],
  status: row.status as PaymentExceptionCase['status'],
  requestedByStableId: row.requestedByStableId,
  operatorNote: row.operatorNote,
  cloverOrderId: row.cloverOrderId,
  approvedByStableId: row.approvedByStableId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Payments infrastructure. All decisions and audit rows use one transaction.
 * No cross-context tables or raw Clover payload are written here.
 */
@Injectable()
export class PrismaPaymentExceptionCaseRepository
  implements PaymentExceptionCaseRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async open(input: PaymentExceptionOpenInput): Promise<PaymentExceptionCase> {
    const row = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.paymentExceptionCase.findUnique({
          where: { attemptId: input.attemptId },
        });
        if (existing) {
          if (
            existing.storeStableId !== input.storeStableId ||
            existing.paymentTransactionId !== input.paymentTransactionId ||
            existing.externalPaymentId !== input.externalPaymentId ||
            existing.amountCents !== input.amountCents ||
            existing.currency !== input.currency ||
            existing.action !== input.action ||
            existing.mode !== input.mode ||
            existing.requestedByStableId !== input.requestedByStableId
          ) {
            throw new Error('PAYMENT_EXCEPTION_DUPLICATE_ATTEMPT_CONFLICT');
          }
          return existing;
        }
        const created = await tx.paymentExceptionCase.create({
          data: {
            attemptId: input.attemptId,
            storeStableId: input.storeStableId,
            paymentTransactionId: input.paymentTransactionId,
            externalPaymentId: input.externalPaymentId,
            amountCents: input.amountCents,
            currency: input.currency,
            action: input.action,
            mode: input.mode,
            status: input.mode === 'SANDBOX' ? 'APPROVED' : 'REQUESTED',
            requestedByStableId: input.requestedByStableId,
            operatorNote: input.operatorNote,
            cloverOrderId: input.cloverOrderId,
          },
        });
        await tx.paymentExceptionEvidence.create({
          data: {
            caseStableId: created.caseStableId,
            source: 'SANQ_PAYMENT_SNAPSHOT',
            resultCode: input.evidenceCode,
            description:
              'Operator request snapshot only; execution requires independent fresh provider evidence',
            observedAt: new Date(),
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return toCase(row);
  }

  async get(caseStableId: string): Promise<PaymentExceptionCase | null> {
    const row = await this.prisma.paymentExceptionCase.findUnique({
      where: { caseStableId },
    });
    return row ? toCase(row) : null;
  }

  async findByAttempt(attemptId: string): Promise<PaymentExceptionCase | null> {
    const row = await this.prisma.paymentExceptionCase.findUnique({
      where: { attemptId },
    });
    return row ? toCase(row) : null;
  }

  async list(storeStableId?: string): Promise<PaymentExceptionCase[]> {
    const rows = await this.prisma.paymentExceptionCase.findMany({
      where: storeStableId ? { storeStableId } : undefined,
      orderBy: [{ updatedAt: 'desc' }, { caseStableId: 'asc' }],
      take: 50,
    });
    return rows.map(toCase);
  }

  async appendEvidence(
    caseStableId: string,
    source: string,
    resultCode: string,
    description: string,
  ): Promise<void> {
    await this.prisma.paymentExceptionEvidence.create({
      data: {
        caseStableId,
        source,
        resultCode,
        description,
        observedAt: new Date(),
      },
    });
  }

  async decide(input: PaymentExceptionDecisionInput): Promise<PaymentExceptionCase | null> {
    const row = await this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.paymentExceptionCase.findUnique({
          where: { caseStableId: input.caseStableId },
        });
        if (!previous || previous.mode !== 'PRODUCTION') return null;
        if (previous.requestedByStableId === input.actorStableId) {
          throw new Error('PAYMENT_EXCEPTION_SELF_APPROVAL_FORBIDDEN');
        }
        if (previous.status !== 'REQUESTED') {
          throw new Error('PAYMENT_EXCEPTION_ALREADY_DECIDED');
        }
        const changed = await tx.paymentExceptionCase.updateMany({
          where: { caseStableId: input.caseStableId, status: 'REQUESTED' },
          data: {
            status: input.decision,
            approvedByStableId:
              input.decision === 'APPROVED' ? input.actorStableId : null,
            approvedAt: input.decision === 'APPROVED' ? new Date() : null,
            decidedAt: new Date(),
          },
        });
        if (changed.count !== 1) {
          throw new Error('PAYMENT_EXCEPTION_APPROVAL_RACE');
        }
        await tx.paymentExceptionApproval.create({
          data: {
            caseStableId: input.caseStableId,
            actorStableId: input.actorStableId,
            decision: input.decision,
            note: input.note,
          },
        });
        return tx.paymentExceptionCase.findUniqueOrThrow({
          where: { caseStableId: input.caseStableId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return row ? toCase(row) : null;
  }

  async claimExecution(caseStableId: string): Promise<'CLAIMED' | 'BUSY' | 'DONE'> {
    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.paymentExceptionCase.findUnique({
          where: { caseStableId },
        });
        if (!current) throw new Error('PAYMENT_EXCEPTION_CASE_NOT_FOUND');
        if (current.status === 'COMPLETED') return 'DONE';
        if (current.status === 'REJECTED' || current.status === 'REQUESTED') {
          return 'BUSY';
        }
        // An interrupted process can be resumed after the lease expires. The
        // underlying payment/fence claim and Benefits RELEASE remain idempotent.
        const leaseExpired = new Date(Date.now() - 120_000);
        const allowed =
          current.status === 'APPROVED' ||
          current.status === 'NEEDS_REVIEW' ||
          (current.status === 'EXECUTING' && current.updatedAt < leaseExpired);
        if (!allowed) return 'BUSY';
        const updated = await tx.paymentExceptionCase.updateMany({
          where: {
            caseStableId,
            status: current.status,
            updatedAt: current.updatedAt,
          },
          data: { status: 'EXECUTING' },
        });
        if (updated.count !== 1) return 'BUSY';
        await tx.paymentExceptionExecution.upsert({
          where: { caseStableId },
          create: { caseStableId, action: current.action },
          update: {
            lastAttemptAt: new Date(),
            attempts: { increment: 1 },
            failureCode: null,
          },
        });
        return 'CLAIMED';
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async finishExecution(
    caseStableId: string,
    complete: boolean,
    failureCode?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentExceptionCase.updateMany({
        where: { caseStableId, status: 'EXECUTING' },
        data: { status: complete ? 'COMPLETED' : 'NEEDS_REVIEW' },
      });
      if (updated.count !== 1) return;
      await tx.paymentExceptionExecution.update({
        where: { caseStableId },
        data: {
          finishedAt: complete ? new Date() : null,
          failureCode: complete ? null : (failureCode ?? 'RECOVERY_INCOMPLETE'),
        },
      });
      await tx.paymentExceptionEvidence.create({
        data: {
          caseStableId,
          source: 'SANQ_RECOVERY_CHECKPOINT',
          resultCode: complete ? 'RECOVERY_COMPLETED' : 'RECOVERY_NEEDS_REVIEW',
          description: failureCode ?? 'Owner checkpoints evaluated',
          observedAt: new Date(),
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
