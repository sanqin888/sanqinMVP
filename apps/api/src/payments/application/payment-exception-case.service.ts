import {
  type PaymentExceptionCase,
  type PaymentExceptionCaseRepository,
  type PaymentExceptionDecisionInput,
  type PaymentExceptionOpenInput,
} from './payment-exception-case.repository';

/** Payments owns case and approval facts; no external provider call here. */
export class PaymentExceptionCaseService {
  constructor(private readonly repository: PaymentExceptionCaseRepository) {}

  open(input: PaymentExceptionOpenInput): Promise<PaymentExceptionCase> {
    return this.repository.open(input);
  }

  get(caseStableId: string): Promise<PaymentExceptionCase | null> {
    return this.repository.get(caseStableId);
  }

  byAttempt(attemptId: string): Promise<PaymentExceptionCase | null> {
    return this.repository.findByAttempt(attemptId);
  }

  list(storeStableId?: string): Promise<PaymentExceptionCase[]> {
    return this.repository.list(storeStableId);
  }

  appendEvidence(
    caseStableId: string,
    source: string,
    resultCode: string,
    description: string,
  ): Promise<void> {
    return this.repository.appendEvidence(
      caseStableId,
      source,
      resultCode,
      description,
    );
  }

  decide(
    input: PaymentExceptionDecisionInput,
  ): Promise<PaymentExceptionCase | null> {
    return this.repository.decide(input);
  }

  claim(caseStableId: string): Promise<'CLAIMED' | 'BUSY' | 'DONE'> {
    return this.repository.claimExecution(caseStableId);
  }

  finish(
    caseStableId: string,
    complete: boolean,
    failureCode?: string,
  ): Promise<void> {
    return this.repository.finishExecution(caseStableId, complete, failureCode);
  }
}
