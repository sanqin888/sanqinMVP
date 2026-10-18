import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PaymentExceptionCaseService,
  PaymentExceptionPaymentGuardService,
  type PaymentExceptionCase,
  type PaymentExceptionAction,
} from '../payments/public-api';
import { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';

/**
 * Case workflow is an orchestrator, not another payments/benefits owner.
 * Approval never authorizes inventing a provider outcome.
 */
@Injectable()
export class PaymentExceptionOrchestrationService {
  constructor(
    private readonly cases: PaymentExceptionCaseService,
    private readonly cardPayments: PosCardPaymentOrchestrationService,
    private readonly paymentGuard: PaymentExceptionPaymentGuardService,
  ) {}

  private readonly sandboxAllFail = 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED';

  private mode(): 'SANDBOX' | 'PRODUCTION' {
    if (this.paymentGuard.isIsolatedSandbox()) return 'SANDBOX';
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.PAYMENT_EXCEPTION_PRODUCTION_ENABLED === 'true'
    ) {
      return 'PRODUCTION';
    }
    throw new ConflictException({
      code: 'PAYMENT_EXCEPTION_WORKFLOW_DISABLED',
      message: 'Exception workflow is not enabled for this environment.',
    });
  }

  async submit(
    storeStableId: string,
    attemptId: string,
    actorStableId: string,
    operatorNote: string,
    cloverOrderId?: string,
  ): Promise<PaymentExceptionCase> {
    const mode = this.mode();
    const original = await this.cardPayments.getReviewAttempt(
      storeStableId,
      attemptId,
    );
    if (!original.paymentId || !original.externalPaymentId) {
      throw new ConflictException('Original Terminal payment identity missing');
    }
    if (original.externalAmountCents <= 0) {
      throw new ConflictException(
        'Zero-card checkout is not a Terminal exception',
      );
    }
    if (!/^[A-Z]{3}$/.test(original.currency)) {
      throw new ConflictException('Original checkout currency is unavailable');
    }
    const terminalFinal =
      original.resultCode !== 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID' &&
      ['FAILED', 'DECLINED', 'CANCELLED'].includes(
        original.paymentStatus ?? '',
      );
    const sandboxEligible =
      original.paymentStatus === 'RECONCILING' &&
      original.terminalOperationState === 'SALE_IN_FLIGHT' &&
      (original.failureCode === this.sandboxAllFail ||
        (original.resultCode === 'CLOVER_TERMINAL_SALE_HTTP_504' &&
          original.failureCode === 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND'));
    const action: PaymentExceptionAction =
      mode === 'SANDBOX' && sandboxEligible
        ? 'SANDBOX_CONFIRM_UNPAID'
        : terminalFinal
          ? 'RELEASE_CONFIRMED_FAILURE'
          : 'INVESTIGATE_ONLY';
    if (mode === 'SANDBOX' && action === 'INVESTIGATE_ONLY') {
      throw new ConflictException({
        code: 'PAYMENT_EXCEPTION_NO_SAFE_SANDBOX_ACTION',
        message:
          'The payment remains unresolved without eligible manual evidence.',
      });
    }
    if (action === 'SANDBOX_CONFIRM_UNPAID' && !cloverOrderId?.trim()) {
      throw new ConflictException('Original Clover order is required');
    }
    return this.cases.open({
      attemptId,
      storeStableId,
      paymentTransactionId: original.paymentId,
      externalPaymentId: original.externalPaymentId,
      amountCents: original.externalAmountCents,
      currency: original.currency,
      mode,
      action,
      requestedByStableId: actorStableId,
      operatorNote,
      cloverOrderId: cloverOrderId?.trim() ?? null,
      evidenceCode:
        original.failureCode ?? original.resultCode ?? 'NO_FINAL_EVIDENCE',
    });
  }

  async byAttempt(
    storeStableId: string,
    attemptId: string,
  ): Promise<PaymentExceptionCase | null> {
    const result = await this.cases.byAttempt(attemptId);
    return result?.storeStableId === storeStableId ? result : null;
  }

  listForStore(storeStableId: string): Promise<PaymentExceptionCase[]> {
    return this.cases.list(storeStableId);
  }

  listForAdmin(): Promise<PaymentExceptionCase[]> {
    return this.cases.list();
  }

  getForAdmin(caseStableId: string): Promise<PaymentExceptionCase | null> {
    return this.cases.get(caseStableId);
  }

  async decide(
    caseStableId: string,
    actorStableId: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ): Promise<PaymentExceptionCase> {
    if (this.mode() !== 'PRODUCTION') {
      throw new ConflictException('Sandbox has no admin approval stage');
    }
    const decided = await this.cases.decide({
      caseStableId,
      actorStableId,
      decision,
      note,
    });
    if (!decided) {
      throw new NotFoundException('Production exception case not found');
    }
    if (
      decision === 'APPROVED' &&
      decided.action === 'RELEASE_CONFIRMED_FAILURE'
    ) {
      await this.execute(caseStableId, decided.storeStableId, true);
    }
    return (await this.cases.get(caseStableId)) ?? decided;
  }

  async execute(
    caseStableId: string,
    storeStableId: string,
    adminApprovedExecution = false,
  ): Promise<PaymentExceptionCase> {
    const current = await this.cases.get(caseStableId);
    if (!current || current.storeStableId !== storeStableId) {
      throw new NotFoundException('Exception case not found for store');
    }
    if (current.mode !== this.mode()) {
      throw new ConflictException('Exception case environment has changed');
    }
    if (
      current.mode === 'PRODUCTION' &&
      (!adminApprovedExecution || !current.approvedByStableId)
    ) {
      throw new ConflictException(
        'Only ADMIN can execute an approved production case',
      );
    }
    if (current.action === 'INVESTIGATE_ONLY') {
      throw new ConflictException(
        'Investigation only: no financial recovery has been authorized.',
      );
    }
    if (
      !['SANDBOX_CONFIRM_UNPAID', 'RELEASE_CONFIRMED_FAILURE'].includes(
        current.action,
      ) ||
      (current.action === 'SANDBOX_CONFIRM_UNPAID' &&
        current.mode !== 'SANDBOX')
    ) {
      throw new ConflictException('Payment exception action is not eligible');
    }
    const claim = await this.cases.claim(caseStableId);
    if (claim === 'BUSY') {
      throw new ConflictException('Recovery already executing or not approved');
    }
    if (claim === 'DONE') return current;
    try {
      // Re-read current owner state immediately before any side effect.
      const before = await this.cardPayments.getReviewAttempt(
        storeStableId,
        current.attemptId,
      );
      if (
        before.paymentId !== current.paymentTransactionId ||
        before.externalPaymentId !== current.externalPaymentId ||
        before.externalAmountCents !== current.amountCents
      ) {
        throw new Error('PAYMENT_EXCEPTION_FROZEN_IDENTITY_CONFLICT');
      }
      await this.cases.appendEvidence(
        caseStableId,
        'SANQ_PRE_EXECUTION_READ',
        before.failureCode ?? before.resultCode ?? 'NO_FINAL_EVIDENCE',
        'Original payment identity, status and store rechecked before owner execution',
      );
      if (current.action === 'SANDBOX_CONFIRM_UNPAID') {
        if (before.status !== 'RECONCILING' && before.status !== 'FAILED') {
          throw new Error('PAYMENT_EXCEPTION_UNPAID_STATUS_CHANGED');
        }
        await this.cardPayments.manuallyCloseSandboxUnpaid(
          storeStableId,
          current.attemptId,
          current.requestedByStableId,
          current.cloverOrderId ?? '',
          current.operatorNote,
          true,
        );
      } else {
        if (
          before.resultCode === 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID' ||
          !['FAILED', 'DECLINED', 'CANCELLED'].includes(
            before.paymentStatus ?? '',
          )
        ) {
          throw new Error(
            'PAYMENT_EXCEPTION_FINAL_FAILURE_NO_LONGER_CONFIRMED',
          );
        }
        await this.cardPayments.recheckReviewAttempt(
          storeStableId,
          current.attemptId,
        );
        const checkpoint = await this.cardPayments.getReviewAttempt(
          storeStableId,
          current.attemptId,
        );
        if (checkpoint.benefitsReleaseComplete) {
          await this.paymentGuard
            .finishConfirmedFailureTerminal(current.attemptId)
            .catch(() => false);
        }
      }
      const after = await this.cardPayments.getReviewAttempt(
        storeStableId,
        current.attemptId,
      );
      await this.cases.appendEvidence(
        caseStableId,
        'SANQ_POST_EXECUTION_READ',
        after.failureCode ?? after.resultCode ?? 'NO_FINAL_EVIDENCE',
        'Checkout Benefits RELEASE and Terminal fence checkpoints independently reread',
      );
      const complete =
        after.benefitsReleaseComplete &&
        after.terminalOperationState === 'FINALIZED' &&
        ['FAILED', 'DECLINED', 'CANCELLED'].includes(after.paymentStatus ?? '');
      await this.cases.finish(
        caseStableId,
        complete,
        complete ? undefined : 'PAYMENT_EXCEPTION_OWNER_CHECKPOINT_PENDING',
      );
    } catch (error) {
      await this.cases.finish(
        caseStableId,
        false,
        error instanceof Error &&
          /^([A-Z][A-Z0-9_]{3,120})$/.test(error.message)
          ? error.message
          : 'PAYMENT_EXCEPTION_EXECUTION_FAILED',
      );
      throw error;
    }
    const latest = await this.cases.get(caseStableId);
    if (!latest) throw new NotFoundException('Exception case disappeared');
    return latest;
  }
}
