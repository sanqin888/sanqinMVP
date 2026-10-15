import { PaymentTransaction } from '../domain/payment-transaction';
import type { TerminalPaymentService } from './create-payment-attempt.use-case';
import type { PaymentTerminalOperationRepository } from './payment-terminal-operation.repository';
import type {
  PaymentProvider,
  PaymentTerminalAvailability,
  PaymentTerminalProvider,
} from './payment-provider.port';
import { SandboxTerminalManualRecoveryService } from './sandbox-terminal-manual-recovery.service';

const attemptId = 'attempt-sandbox-504';
const storeStableId = '4750_Yonge_Street';
const paymentId = '3b5894e9-8d5b-4bac-9c6b-bcf9b5e53410';
const externalPaymentId = 'sq_test_orig_504';

const originalPayment = (): PaymentTransaction =>
  PaymentTransaction.create({
    id: paymentId,
    attemptId,
    idempotencyKey: 'original-idempotency',
    provider: 'CLOVER',
    source: 'POS_TERMINAL',
    operation: 'SALE',
    paymentMethod: 'CARD',
    amountCents: 565,
    currency: 'CAD',
    externalPaymentId,
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
  })
    .transitionTo('PROCESSING')
    .applyProviderOutcome({
      status: 'UNKNOWN',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    })
    .transitionTo('RECONCILING');

const createHarness = () => {
  let payment = originalPayment();
  const terminalPayments = {
    findById: jest.fn().mockImplementation(() => Promise.resolve(payment)),
    getAvailability: jest.fn().mockResolvedValue({
      available: true,
      state: 'AVAILABLE',
      terminalId: 'compact-test-1',
      providerState: 'IDLE',
      providerStateExplicit: true,
    }),
    reconcile: jest.fn().mockImplementation(() => Promise.resolve(payment)),
  } as unknown as jest.Mocked<TerminalPaymentService>;
  const operations = {
    findByAttemptId: jest.fn().mockResolvedValue({
      attemptId,
      terminalId: 'compact-test-1',
      storeStableId,
      paymentTransactionId: paymentId,
      externalPaymentId,
      state: 'SALE_IN_FLIGHT',
      cancelRequestedAt: null,
    }),
    getSandboxManualUnpaidDecision: jest.fn().mockResolvedValue(null),
    claimSandboxManualUnpaid: jest.fn().mockImplementation(() => {
      payment = payment.applyProviderOutcome({
        status: 'FAILED',
        resultCode: 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID',
        failureCode: 'SANDBOX_OPERATOR_ATTESTED_NO_PAYMENT',
      });
      return Promise.resolve('CLAIMED' as const);
    }),
    checkpointSandboxBenefitsReleased: jest.fn().mockResolvedValue(undefined),
    noteSandboxLateCanonicalSuccess: jest.fn().mockResolvedValue(undefined),
    finalizeSandboxManualUnpaid: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<PaymentTerminalOperationRepository>;
  const provider = {
    getPaymentStatus: jest.fn().mockResolvedValue({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    }),
  } as unknown as jest.Mocked<PaymentProvider>;
  const terminalProvider = {
    prepareOriginalSaleResume: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<PaymentTerminalProvider>;
  const service = new SandboxTerminalManualRecoveryService(
    terminalPayments,
    operations,
    provider,
    terminalProvider,
  );
  return {
    service,
    terminalPayments,
    operations,
    provider,
    terminalProvider,
    setPayment: (next: PaymentTransaction) => {
      payment = next;
    },
  };
};
const input = {
  paymentId,
  attemptId,
  storeStableId,
  actorUserStableId: 'coperator-test',
  cloverOrderId: 'J69R16PIHFKYG',
  operatorNote: 'Test Merchant shows Open order with No Payments',
};

describe('SandboxTerminalManualRecoveryService', () => {
  it('requires development/test runtime, explicit flag, local DB and sandbox merchant', () => {
    const { service } = createHarness();
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'development',
      POS_CLOVER_SANDBOX_MANUAL_RECOVERY_ENABLED: 'true',
      DATABASE_URL: 'postgresql://local:local@127.0.0.1:5432/restaurant',
      CLOVER_UNIFIED_PLATFORM_API_BASE: 'https://apisandbox.dev.clover.com',
      CLOVER_UNIFIED_MERCHANT_ID: 'sandbox-merchant',
      CLOVER_MERCHANT_ID: 'production-merchant',
      CLOVER_TERMINAL_DEVICE_ID: 'compact-test-1',
    };
    expect(service.isEnabled(env)).toBe(true);
    expect(service.isEnabled({ ...env, NODE_ENV: 'production' })).toBe(false);
    expect(
      service.isEnabled({
        ...env,
        DATABASE_URL: 'postgresql://user:pass@live-db:5432/restaurant',
      }),
    ).toBe(false);
    expect(
      service.isEnabled({
        ...env,
        CLOVER_UNIFIED_PLATFORM_API_BASE: 'https://api.clover.com',
      }),
    ).toBe(false);
    expect(
      service.isEnabled({
        ...env,
        CLOVER_UNIFIED_MERCHANT_ID: 'production-merchant',
      }),
    ).toBe(false);
  });

  it('rejects unauthorised runtime before provider or persistence calls', async () => {
    const { service, provider, operations } = createHarness();
    await expect(service.acceptSandboxManualUnpaid(input)).rejects.toThrow(
      'POS_SANDBOX_MANUAL_RECOVERY_DISABLED',
    );
    expect(provider.getPaymentStatus.mock.calls).toHaveLength(0);
    expect(operations.claimSandboxManualUnpaid.mock.calls).toHaveLength(0);
  });

  it('requires original 504, fresh canonical NOT_FOUND and idle device before auditable claim', async () => {
    const { service, operations, terminalPayments } = createHarness();
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);
    const result = await service.acceptSandboxManualUnpaid(input);
    expect(result.status).toBe('FAILED');
    expect(terminalPayments.reconcile.mock.calls).toEqual([[paymentId]]);
    expect(
      operations.claimSandboxManualUnpaid.mock.calls[0]?.[0],
    ).toMatchObject({
      attemptId,
      paymentTransactionId: paymentId,
      storeStableId,
      externalPaymentId,
      actorUserStableId: 'coperator-test',
      originalResultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      originalFailureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    expect(terminalPayments.findById.mock.calls).toEqual([
      [paymentId],
      [paymentId],
    ]);
  });

  const unsafeAvailabilities: Array<[string, PaymentTerminalAvailability]> = [
    [
      'HTTP 200 with no explicit state (synthetic AVAILABLE)',
      {
        state: 'AVAILABLE',
        available: true,
        configured: true,
        terminalId: 'compact-test-1',
        providerState: 'AVAILABLE',
        providerStateExplicit: false,
      },
    ],
    [
      'HTTP 200 with UNKNOWN provider state',
      {
        state: 'AVAILABLE',
        available: true,
        configured: true,
        terminalId: 'compact-test-1',
        providerState: 'UNKNOWN',
        providerStateExplicit: true,
      },
    ],
    [
      'device status exists but explicit-evidence marker is missing',
      {
        state: 'AVAILABLE',
        available: true,
        configured: true,
        terminalId: 'compact-test-1',
        providerState: 'IDLE',
      },
    ],
    [
      'busy device',
      {
        state: 'BUSY',
        available: false,
        configured: true,
        terminalId: 'compact-test-1',
        providerState: 'BUSY',
        providerStateExplicit: true,
      },
    ],
    [
      'missing provider status',
      {
        state: 'AVAILABLE',
        available: true,
        configured: true,
        terminalId: 'compact-test-1',
        providerStateExplicit: true,
      },
    ],
    [
      'different terminal identity',
      {
        state: 'AVAILABLE',
        available: true,
        configured: true,
        terminalId: 'another-terminal',
        providerState: 'IDLE',
        providerStateExplicit: true,
      },
    ],
  ];

  it.each(unsafeAvailabilities)(
    'rejects %s before canonical reconciliation or any financial write',
    async (_, availability) => {
      const { service, operations, terminalPayments, terminalProvider } =
        createHarness();
      jest.spyOn(service, 'isEnabled').mockReturnValue(true);
      terminalPayments.getAvailability.mockResolvedValue(availability);

      await expect(service.acceptSandboxManualUnpaid(input)).rejects.toThrow(
        'POS_SANDBOX_MANUAL_TERMINAL_NOT_IDLE',
      );
      expect(terminalPayments.reconcile.mock.calls).toHaveLength(0);
      expect(operations.claimSandboxManualUnpaid.mock.calls).toHaveLength(0);
      expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
        0,
      );
    },
  );

  it('rejects newly found successful payment without an operator claim', async () => {
    const { service, terminalPayments, operations } = createHarness();
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);
    terminalPayments.reconcile.mockResolvedValue(
      originalPayment().applyProviderOutcome({
        status: 'SUCCEEDED',
        providerPaymentId: 'real-canonical-payment',
      }),
    );
    await expect(service.acceptSandboxManualUnpaid(input)).rejects.toThrow(
      'POS_SANDBOX_MANUAL_CANONICAL_CONFLICT',
    );
    expect(operations.claimSandboxManualUnpaid.mock.calls).toHaveLength(0);
  });

  it('reuses the same audited decision after process restart without a second claim', async () => {
    const { service, operations, terminalPayments, setPayment } =
      createHarness();
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);
    setPayment(
      originalPayment().applyProviderOutcome({
        status: 'FAILED',
        resultCode: 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID',
      }),
    );
    operations.getSandboxManualUnpaidDecision.mockResolvedValue({
      ...input,
      paymentTransactionId: paymentId,
      terminalId: 'compact-test-1',
      externalPaymentId,
      originalResultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      originalFailureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      canonicalCheckedAt: new Date(),
      benefitsReleasedAt: null,
      terminalFinalizedAt: null,
      lateCanonicalAt: null,
      lateProviderPaymentId: null,
    });
    await expect(
      service.acceptSandboxManualUnpaid(input),
    ).resolves.toMatchObject({ status: 'FAILED' });
    expect(operations.claimSandboxManualUnpaid.mock.calls).toHaveLength(0);
    expect(terminalPayments.reconcile.mock.calls).toHaveLength(0);
  });

  it('keeps an attested terminal fenced when status only infers AVAILABLE', async () => {
    const {
      service,
      operations,
      provider,
      terminalPayments,
      terminalProvider,
      setPayment,
    } = createHarness();
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);
    setPayment(
      originalPayment().applyProviderOutcome({
        status: 'FAILED',
        resultCode: 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID',
      }),
    );
    operations.getSandboxManualUnpaidDecision.mockResolvedValue({
      ...input,
      paymentTransactionId: paymentId,
      terminalId: 'compact-test-1',
      externalPaymentId,
      originalResultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      originalFailureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      canonicalCheckedAt: new Date(),
      benefitsReleasedAt: new Date(),
      terminalFinalizedAt: null,
      lateCanonicalAt: null,
      lateProviderPaymentId: null,
    });
    terminalPayments.getAvailability.mockResolvedValue({
      state: 'AVAILABLE',
      available: true,
      configured: true,
      terminalId: 'compact-test-1',
      providerState: 'AVAILABLE',
      providerStateExplicit: false,
    });

    await expect(
      service.finishSandboxManualUnpaid(attemptId, storeStableId),
    ).resolves.toBe(false);
    expect(provider.getPaymentStatus.mock.calls).toHaveLength(1);
    expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
      0,
    );
    expect(operations.finalizeSandboxManualUnpaid.mock.calls).toHaveLength(0);
  });

  it('finalizes after explicit IDLE, fresh canonical NOT_FOUND and Welcome', async () => {
    const {
      service,
      operations,
      provider,
      terminalPayments,
      terminalProvider,
      setPayment,
    } = createHarness();
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);
    setPayment(
      originalPayment().applyProviderOutcome({
        status: 'FAILED',
        resultCode: 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID',
      }),
    );
    operations.getSandboxManualUnpaidDecision.mockResolvedValue({
      ...input,
      paymentTransactionId: paymentId,
      terminalId: 'compact-test-1',
      externalPaymentId,
      originalResultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      originalFailureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      canonicalCheckedAt: new Date(),
      benefitsReleasedAt: new Date(),
      terminalFinalizedAt: null,
      lateCanonicalAt: null,
      lateProviderPaymentId: null,
    });

    await expect(
      service.finishSandboxManualUnpaid(attemptId, storeStableId),
    ).resolves.toBe(true);
    expect(provider.getPaymentStatus.mock.calls).toHaveLength(1);
    expect(terminalPayments.getAvailability.mock.calls).toHaveLength(1);
    expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
      1,
    );
    expect(operations.finalizeSandboxManualUnpaid.mock.calls).toEqual([
      [attemptId],
    ]);
  });

  it('does not finalize a manually-closed fence if canonical truth turns positive', async () => {
    const { service, operations, provider, terminalProvider, setPayment } =
      createHarness();
    jest.spyOn(service, 'isEnabled').mockReturnValue(true);
    setPayment(
      originalPayment().applyProviderOutcome({
        status: 'FAILED',
        resultCode: 'POS_TERMINAL_SANDBOX_OPERATOR_UNPAID',
      }),
    );
    operations.getSandboxManualUnpaidDecision.mockResolvedValue({
      ...input,
      paymentTransactionId: paymentId,
      terminalId: 'compact-test-1',
      externalPaymentId,
      originalResultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      originalFailureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      canonicalCheckedAt: new Date(),
      benefitsReleasedAt: new Date(),
      terminalFinalizedAt: null,
      lateCanonicalAt: null,
      lateProviderPaymentId: null,
    });
    provider.getPaymentStatus.mockResolvedValue({
      status: 'SUCCEEDED',
      providerPaymentId: 'late-paid',
    });
    await expect(
      service.finishSandboxManualUnpaid(attemptId, storeStableId),
    ).rejects.toThrow('POS_SANDBOX_MANUAL_LATE_CANONICAL_CONFLICT');
    expect(operations.noteSandboxLateCanonicalSuccess.mock.calls).toEqual([
      [attemptId, 'late-paid'],
    ]);
    expect(terminalProvider.prepareOriginalSaleResume.mock.calls).toHaveLength(
      0,
    );
    expect(operations.finalizeSandboxManualUnpaid.mock.calls).toHaveLength(0);
  });
});
