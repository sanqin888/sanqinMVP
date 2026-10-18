import type {
  PaymentExceptionCase,
  PaymentExceptionCaseService,
  PaymentExceptionPaymentGuardService,
} from '../payments/public-api';
import type { PosCardPaymentOrchestrationService } from './pos-card-payment-orchestration.service';
import { PaymentExceptionOrchestrationService } from './payment-exception-orchestration.service';

const attemptId = '1543e3b5-e091-4653-ae32-9b6ac3288526';
const storeStableId = '4750_Yonge_Street';
const paymentId = 'e43f6b4a-bb82-4b75-b87d-9c083f89bfaa';

const baseDetail = {
  attemptId,
  paymentId,
  status: 'RECONCILING',
  paymentStatus: 'RECONCILING',
  resultCode: null,
  failureCode: 'CLOVER_PLATFORM_ALL_ATTEMPTS_FAILED',
  externalPaymentId: 'sq_03e196de4ddf2d926715d05c9914c',
  externalAmountCents: 1695,
  currency: 'CAD',
  terminalOperationState: 'SALE_IN_FLIGHT',
  benefitsReleaseComplete: false,
};
const baseCase: PaymentExceptionCase = {
  caseStableId: 'case-test-1',
  attemptId,
  storeStableId,
  paymentTransactionId: paymentId,
  externalPaymentId: baseDetail.externalPaymentId,
  amountCents: 1695,
  currency: 'CAD',
  action: 'SANDBOX_CONFIRM_UNPAID',
  mode: 'SANDBOX',
  status: 'APPROVED',
  requestedByStableId: 'staff-one',
  operatorNote: 'Confirmed both card attempts FAIL in sandbox',
  cloverOrderId: '2YJK1ED5GTZZG',
  approvedByStableId: null,
  createdAt: '2026-10-17T21:00:00.000Z',
  updatedAt: '2026-10-17T21:00:00.000Z',
};

const harness = () => {
  const cases = {
    open: jest.fn().mockResolvedValue(baseCase),
    get: jest.fn().mockResolvedValue(baseCase),
    byAttempt: jest.fn().mockResolvedValue(baseCase),
    list: jest.fn().mockResolvedValue([baseCase]),
    decide: jest.fn().mockResolvedValue({
      ...baseCase,
      mode: 'PRODUCTION',
      action: 'INVESTIGATE_ONLY',
      status: 'APPROVED',
      approvedByStableId: 'admin-two',
    }),
    claim: jest.fn().mockResolvedValue('CLAIMED'),
    finish: jest.fn().mockResolvedValue(undefined),
    appendEvidence: jest.fn().mockResolvedValue(undefined),
  };
  const cardPayments = {
    getReviewAttempt: jest.fn().mockResolvedValue(baseDetail),
    manuallyCloseSandboxUnpaid: jest.fn().mockResolvedValue(undefined),
    recheckReviewAttempt: jest.fn().mockResolvedValue(undefined),
  };
  const paymentGuard = {
    isIsolatedSandbox: jest.fn().mockReturnValue(true),
    finishConfirmedFailureTerminal: jest.fn().mockResolvedValue(true),
  };
  const service = new PaymentExceptionOrchestrationService(
    cases as unknown as PaymentExceptionCaseService,
    cardPayments as unknown as PosCardPaymentOrchestrationService,
    paymentGuard as unknown as PaymentExceptionPaymentGuardService,
  );
  return { service, cases, cardPayments, paymentGuard };
};

describe('PaymentExceptionOrchestrationService PEM', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('opens a single sandbox case without calling Clover or releasing benefits', async () => {
    const { service, cases, cardPayments } = harness();
    await expect(
      service.submit(
        storeStableId,
        attemptId,
        'staff-one',
        'Confirmed both card attempts FAIL in sandbox',
        '2YJK1ED5GTZZG',
      ),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(cases.open.mock.calls[0]?.[0]).toMatchObject({
      action: 'SANDBOX_CONFIRM_UNPAID',
      mode: 'SANDBOX',
      paymentTransactionId: paymentId,
      externalPaymentId: baseDetail.externalPaymentId,
      amountCents: 1695,
    });
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
    expect(cardPayments.recheckReviewAttempt.mock.calls).toHaveLength(0);
  });

  it('refuses to create an executable sandbox case from an unknown payment', async () => {
    const { service, cases, cardPayments } = harness();
    cardPayments.getReviewAttempt.mockResolvedValue({
      ...baseDetail,
      failureCode: 'CLOVER_PLATFORM_HTTP_500',
    });
    await expect(
      service.submit(
        storeStableId,
        attemptId,
        'staff-one',
        'Incomplete result must not be released',
        '2YJK1ED5GTZZG',
      ),
    ).rejects.toThrow();
    expect(cases.open.mock.calls).toHaveLength(0);
  });

  it('finishes only after owner RELEASE and Terminal FINALIZED checkpoints', async () => {
    const { service, cases, cardPayments } = harness();
    cardPayments.getReviewAttempt
      .mockResolvedValueOnce(baseDetail)
      .mockResolvedValueOnce({
        ...baseDetail,
        paymentStatus: 'FAILED',
        status: 'FAILED',
        benefitsReleaseComplete: true,
        terminalOperationState: 'FINALIZED',
      });
    await service.execute(baseCase.caseStableId, storeStableId);
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toEqual([[
      storeStableId,
      attemptId,
      'staff-one',
      '2YJK1ED5GTZZG',
      baseCase.operatorNote,
      true,
    ]]);
    expect(cases.finish.mock.calls).toEqual([[baseCase.caseStableId, true, undefined]]);
  });

  it('blocks a cross-store request before making any financial call', async () => {
    const { service, cases, cardPayments } = harness();
    await expect(
      service.execute(baseCase.caseStableId, 'another-store'),
    ).rejects.toThrow();
    expect(cases.claim.mock.calls).toHaveLength(0);
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
  });

  it('rejects a stale payment identity and checkpoints NEEDS_REVIEW', async () => {
    const { service, cases, cardPayments } = harness();
    cardPayments.getReviewAttempt.mockResolvedValue({
      ...baseDetail,
      externalPaymentId: 'different-sale',
    });
    await expect(service.execute(baseCase.caseStableId, storeStableId)).rejects.toThrow(
      'PAYMENT_EXCEPTION_FROZEN_IDENTITY_CONFLICT',
    );
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
    expect(cases.finish.mock.calls[0]?.[1]).toBe(false);
  });

  it('only investigates an unresolved production payment; admin approval does not execute', async () => {
    const { service, paymentGuard, cases, cardPayments } = harness();
    paymentGuard.isIsolatedSandbox.mockReturnValue(false);
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_EXCEPTION_PRODUCTION_ENABLED = 'true';
    await service.submit(
      storeStableId,
      attemptId,
      'staff-one',
      'Original payment remains unknown; please investigate',
    );
    expect(cases.open.mock.calls[0]?.[0]).toMatchObject({
      mode: 'PRODUCTION',
      action: 'INVESTIGATE_ONLY',
    });
    await service.decide('case-test-1', 'admin-two', 'APPROVED', 'Review requires provider settlement');
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
    expect(cardPayments.recheckReviewAttempt.mock.calls).toHaveLength(0);
  });

  it('denies staff execution of production recovery even if the case was approved', async () => {
    const { service, paymentGuard, cases, cardPayments } = harness();
    paymentGuard.isIsolatedSandbox.mockReturnValue(false);
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_EXCEPTION_PRODUCTION_ENABLED = 'true';
    cases.get.mockResolvedValue({
      ...baseCase,
      mode: 'PRODUCTION',
      action: 'RELEASE_CONFIRMED_FAILURE',
      approvedByStableId: 'admin-two',
    });
    await expect(service.execute(baseCase.caseStableId, storeStableId))
      .rejects.toThrow('Only ADMIN');
    expect(cardPayments.recheckReviewAttempt.mock.calls).toHaveLength(0);
  });

  it('allows approved production recovery only for an already final failed payment', async () => {
    const { service, paymentGuard, cases, cardPayments } = harness();
    paymentGuard.isIsolatedSandbox.mockReturnValue(false);
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_EXCEPTION_PRODUCTION_ENABLED = 'true';
    cases.get.mockResolvedValue({
      ...baseCase,
      mode: 'PRODUCTION',
      status: 'APPROVED',
      action: 'RELEASE_CONFIRMED_FAILURE',
      approvedByStableId: 'admin-two',
    });
    cardPayments.getReviewAttempt
      .mockResolvedValueOnce({
        ...baseDetail,
        paymentStatus: 'DECLINED',
        status: 'DECLINED',
      })
      .mockResolvedValueOnce({
        ...baseDetail,
        paymentStatus: 'DECLINED',
        status: 'DECLINED',
        benefitsReleaseComplete: true,
      })
      .mockResolvedValueOnce({
        ...baseDetail,
        paymentStatus: 'DECLINED',
        status: 'DECLINED',
        benefitsReleaseComplete: true,
        terminalOperationState: 'FINALIZED',
      });
    await service.execute(baseCase.caseStableId, storeStableId, true);
    expect(cardPayments.recheckReviewAttempt.mock.calls).toEqual([[storeStableId, attemptId]]);
    expect(paymentGuard.finishConfirmedFailureTerminal.mock.calls).toEqual([[attemptId]]);
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
    expect(cases.finish.mock.calls[0]?.[1]).toBe(true);
  });

  it('keeps an unknown production payment fenced despite ADMIN approval', async () => {
    const { service, paymentGuard, cases, cardPayments } = harness();
    paymentGuard.isIsolatedSandbox.mockReturnValue(false);
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_EXCEPTION_PRODUCTION_ENABLED = 'true';
    cases.get.mockResolvedValue({
      ...baseCase,
      mode: 'PRODUCTION',
      status: 'APPROVED',
      action: 'INVESTIGATE_ONLY',
      approvedByStableId: 'admin-two',
    });
    await expect(service.execute(baseCase.caseStableId, storeStableId, true))
      .rejects.toThrow('Investigation only');
    expect(cases.claim.mock.calls).toHaveLength(0);
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
  });

  it('prevents duplicate parallel recovery executions', async () => {
    const { service, cases, cardPayments } = harness();
    cases.claim.mockResolvedValue('BUSY');
    await expect(service.execute(baseCase.caseStableId, storeStableId))
      .rejects.toThrow('Recovery already executing');
    expect(cardPayments.manuallyCloseSandboxUnpaid.mock.calls).toHaveLength(0);
  });

  it('requires explicit production opt-in for staff requests', async () => {
    const { service, paymentGuard, cases } = harness();
    paymentGuard.isIsolatedSandbox.mockReturnValue(false);
    process.env.NODE_ENV = 'production';
    delete process.env.PAYMENT_EXCEPTION_PRODUCTION_ENABLED;
    await expect(
      service.submit(storeStableId, attemptId, 'staff-one', 'Investigate payment status'),
    ).rejects.toThrow();
    expect(cases.open.mock.calls).toHaveLength(0);
  });
});
