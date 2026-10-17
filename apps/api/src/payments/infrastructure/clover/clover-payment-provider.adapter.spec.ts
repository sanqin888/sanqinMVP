import { CloverPaymentProviderAdapter } from './clover-payment-provider.adapter';
import { CloverPlatformPaymentsGateway } from './platform/clover-platform-payments.gateway';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import type { CloverMerchantAccessTokenService } from './oauth/clover-merchant-access-token.service';
import {
  CloverTerminalTransport,
  mapTerminalAvailabilityResponse,
  mapTerminalPaymentResponse,
} from './terminal/clover-terminal.transport';

describe('CloverPaymentProviderAdapter', () => {
  const createAdapter = () => {
    const config = new CloverProviderConfig();
    const ecommerce = new CloverEcommerceTransport(config);
    const accessTokens = {
      hasUsableCredential: jest.fn().mockResolvedValue(true),
      getAccessToken: jest.fn().mockResolvedValue({ token: 'platform-token' }),
    } as unknown as CloverMerchantAccessTokenService;
    const terminal = new CloverTerminalTransport(config, accessTokens);
    const platform = new CloverPlatformPaymentsGateway(config, accessTokens);
    const platformConfigured = jest
      .spyOn(platform, 'isConfigured')
      .mockResolvedValue(true);
    return {
      adapter: new CloverPaymentProviderAdapter(ecommerce, terminal, platform),
      ecommerce,
      terminal,
      platform,
      platformConfigured,
    };
  };

  it('routes Web Ecommerce through the Ecommerce transport and normalizes success', async () => {
    const { adapter, ecommerce } = createAdapter();
    const createCardPayment = jest
      .spyOn(ecommerce, 'createCardPayment')
      .mockResolvedValue({
        ok: true,
        paymentId: 'clover_pay_1',
        status: 'succeeded',
      });

    await expect(
      adapter.startPayment({
        paymentId: 'payment_1',
        attemptId: 'attempt_1',
        amountCents: 1024,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'WEB_ECOMMERCE',
        idempotencyKey: 'attempt_1',
        externalPaymentId: 'checkout_1',
        paymentInstrumentToken: 'token_1',
        description: 'Online Order checkout_1',
      }),
    ).resolves.toEqual({
      status: 'SUCCEEDED',
      externalPaymentId: 'checkout_1',
      providerPaymentId: 'clover_pay_1',
      resultCode: 'succeeded',
    });

    expect(createCardPayment).toHaveBeenCalledWith({
      amountCents: 1024,
      currency: 'CAD',
      source: 'token_1',
      orderId: 'payment_1',
      externalPaymentId: 'checkout_1',
      idempotencyKey: 'attempt_1',
      description: 'Online Order checkout_1',
    });
  });

  it('rejects Web Ecommerce start without a payment instrument token', async () => {
    const { adapter, ecommerce } = createAdapter();
    const createCardPayment = jest.spyOn(ecommerce, 'createCardPayment');

    await expect(
      adapter.startPayment({
        paymentId: 'payment_2',
        attemptId: 'attempt_2',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'WEB_ECOMMERCE',
        idempotencyKey: 'attempt_2',
      }),
    ).resolves.toEqual({
      status: 'FAILED',
      failureCode: 'CLOVER_PAYMENT_INSTRUMENT_REQUIRED',
      failureMessage: 'Clover Ecommerce requires a payment instrument token',
    });

    expect(createCardPayment).not.toHaveBeenCalled();
  });

  it('treats Terminal success as execution evidence until Platform v3 confirms it', async () => {
    const { adapter, terminal, platform } = createAdapter();
    const startPayment = jest
      .spyOn(terminal, 'startPayment')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'EXECUTION',
        providerPaymentId: 'terminal-payment-1',
        externalPaymentId: 'external-terminal-1',
        terminalId: 'device-1',
      });
    const canonicalRead = jest
      .spyOn(platform, 'getCanonicalPayment')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'CANONICAL',
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        idempotencyKey: 'attempt_terminal',
        providerPaymentId: 'terminal-payment-1',
        externalPaymentId: 'external-terminal-1',
        amountCents: 1000,
        currency: 'CAD',
        surchargeCents: 24,
        chargedTotalCents: 1024,
        resultCode: 'success',
      });
    const request = {
      paymentId: 'payment_terminal',
      attemptId: 'attempt_terminal',
      amountCents: 1000,
      currency: 'CAD',
      paymentMethod: 'CARD' as const,
      source: 'POS_TERMINAL' as const,
      idempotencyKey: 'attempt_terminal',
      externalPaymentId: 'external-terminal-1',
    };

    await expect(adapter.startPayment(request)).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerPaymentId: 'terminal-payment-1',
      terminalId: 'device-1',
      surchargeCents: 24,
      chargedTotalCents: 1024,
    });
    expect(startPayment).toHaveBeenCalledWith(request);
    expect(canonicalRead).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        providerPaymentId: 'terminal-payment-1',
        externalPaymentId: 'external-terminal-1',
        amountCents: 1000,
        currency: 'CAD',
      }),
    );
  });

  it('keeps Terminal success UNKNOWN when Platform v3 has not exposed the payment yet', async () => {
    const { adapter, terminal, platform } = createAdapter();
    jest.spyOn(terminal, 'startPayment').mockResolvedValue({
      status: 'SUCCEEDED',
      evidence: 'EXECUTION',
      providerPaymentId: 'terminal-payment-1',
      externalPaymentId: 'external-terminal-1',
    });
    jest.spyOn(platform, 'getCanonicalPayment').mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      paymentId: 'payment_terminal',
      attemptId: 'attempt_terminal',
      idempotencyKey: 'attempt_terminal',
      providerPaymentId: 'terminal-payment-1',
      externalPaymentId: 'external-terminal-1',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
      failureMessage: 'not visible yet',
    });

    await expect(
      adapter.startPayment({
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt_terminal',
        externalPaymentId: 'external-terminal-1',
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
  });

  it('preserves the original HTTP 504 replay marker only when Platform does not find a payment', async () => {
    const { adapter, terminal, platform } = createAdapter();
    jest.spyOn(terminal, 'startPayment').mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'EXECUTION',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_HTTP_504',
    });
    jest.spyOn(platform, 'getCanonicalPayment').mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
    await expect(
      adapter.startPayment({
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt_terminal',
        externalPaymentId: 'external-terminal-1',
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND',
    });
  });

  it('recovers a lost Terminal response through Platform v3 externalPaymentId lookup', async () => {
    const { adapter, terminal, platform } = createAdapter();
    jest.spyOn(terminal, 'startPayment').mockResolvedValue({
      status: 'UNKNOWN',
      externalPaymentId: 'external-terminal-1',
      failureCode: 'CLOVER_TERMINAL_PAYMENT_REQUEST_UNCERTAIN',
    });
    const canonicalRead = jest
      .spyOn(platform, 'getCanonicalPayment')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'CANONICAL',
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        idempotencyKey: 'attempt_terminal',
        providerPaymentId: 'terminal-payment-recovered',
        externalPaymentId: 'external-terminal-1',
        amountCents: 1000,
        currency: 'CAD',
        surchargeCents: 0,
        chargedTotalCents: 1000,
        resultCode: 'success',
      });

    await expect(
      adapter.startPayment({
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt_terminal',
        externalPaymentId: 'external-terminal-1',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerPaymentId: 'terminal-payment-recovered',
    });
    expect(canonicalRead).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPaymentId: undefined,
        externalPaymentId: 'external-terminal-1',
      }),
    );
  });

  it('uses Platform v3 rather than REST Pay status for POS reconciliation', async () => {
    const { adapter, terminal, platform } = createAdapter();
    const terminalStatus = jest.spyOn(terminal, 'getPaymentStatus');
    const canonicalRead = jest
      .spyOn(platform, 'getCanonicalPayment')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'CANONICAL',
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        idempotencyKey: 'attempt_terminal',
        externalPaymentId: 'external-terminal-1',
        providerPaymentId: 'terminal-payment-1',
        amountCents: 1000,
        currency: 'CAD',
        surchargeCents: 0,
        chargedTotalCents: 1000,
      });

    await expect(
      adapter.getPaymentStatus({
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt_terminal',
        externalPaymentId: 'external-terminal-1',
        providerPaymentId: 'terminal-payment-1',
        amountCents: 1000,
        currency: 'CAD',
      }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED', evidence: 'CANONICAL' });

    expect(canonicalRead).toHaveBeenCalledTimes(1);
    expect(terminalStatus).not.toHaveBeenCalled();
  });

  it('treats Terminal refund execution as provisional until Platform v3 confirms canonical refund facts', async () => {
    const { adapter, terminal, platform } = createAdapter();
    const terminalRefund = jest
      .spyOn(terminal, 'refundPayment')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'EXECUTION',
        providerPaymentId: 'terminal-payment-1',
        providerRefundId: 'terminal-refund-1',
        terminalId: 'device-1',
      });
    const canonicalRead = jest
      .spyOn(platform, 'getCanonicalReversal')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'CANONICAL',
        paymentId: 'refund-payment-internal',
        attemptId: 'refund-attempt',
        idempotencyKey: 'refund-idempotency',
        providerPaymentId: 'terminal-payment-1',
        providerRefundId: 'terminal-refund-1',
        amountCents: 2000,
        currency: 'CAD',
        refundedAmountCents: 2000,
        tipCents: 0,
        surchargeCents: 48,
        chargedTotalCents: 2048,
      });

    await expect(
      adapter.refundPayment({
        paymentId: 'refund-payment-internal',
        attemptId: 'refund-attempt',
        source: 'POS_TERMINAL',
        idempotencyKey: 'refund-idempotency',
        operation: 'REFUND',
        providerPaymentId: 'terminal-payment-1',
        amountCents: 2000,
        currency: 'CAD',
        expectedTipRefundCents: 0,
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerRefundId: 'terminal-refund-1',
      terminalId: 'device-1',
      chargedTotalCents: 2048,
    });
    expect(terminalRefund).toHaveBeenCalledTimes(1);
    expect(canonicalRead).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'REFUND',
        providerPaymentId: 'terminal-payment-1',
        providerRefundId: 'terminal-refund-1',
        expectedTipRefundCents: 0,
        expectedAdditionalChargeRefundCents: 48,
      }),
    );
  });

  it('keeps an Interac-style device refund unresolved until Platform v3 exposes canonical truth', async () => {
    const { adapter, terminal, platform } = createAdapter();
    jest.spyOn(terminal, 'refundPayment').mockResolvedValue({
      status: 'SUCCEEDED',
      evidence: 'EXECUTION',
      providerPaymentId: 'interac-payment-1',
      providerRefundId: 'interac-refund-1',
      terminalId: 'device-1',
    });
    jest.spyOn(platform, 'getCanonicalReversal').mockResolvedValue({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      paymentId: 'interac-refund-internal',
      attemptId: 'interac-refund-attempt',
      idempotencyKey: 'interac-refund-idempotency',
      providerPaymentId: 'interac-payment-1',
      amountCents: 2000,
      currency: 'CAD',
      failureCode: 'CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE',
      failureMessage: 'refund is not visible yet',
    });

    await expect(
      adapter.refundPayment({
        paymentId: 'interac-refund-internal',
        attemptId: 'interac-refund-attempt',
        source: 'POS_TERMINAL',
        idempotencyKey: 'interac-refund-idempotency',
        operation: 'REFUND',
        providerPaymentId: 'interac-payment-1',
        amountCents: 2000,
        currency: 'CAD',
        expectedTipRefundCents: 0,
        expectedAdditionalChargeRefundCents: 0,
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      evidence: 'CANONICAL',
      providerPaymentId: 'interac-payment-1',
      providerRefundId: 'interac-refund-1',
      terminalId: 'device-1',
      failureCode: 'CLOVER_PLATFORM_REVERSAL_NOT_YET_VISIBLE',
    });
  });

  it('uses Platform v3 reversal truth instead of REST Pay for refund reconciliation', async () => {
    const { adapter, terminal, platform } = createAdapter();
    const terminalStatus = jest.spyOn(terminal, 'getPaymentStatus');
    const canonicalRead = jest
      .spyOn(platform, 'getCanonicalReversal')
      .mockResolvedValue({
        status: 'SUCCEEDED',
        evidence: 'CANONICAL',
        paymentId: 'refund-payment-internal',
        attemptId: 'refund-attempt',
        idempotencyKey: 'refund-idempotency',
        providerPaymentId: 'terminal-payment-1',
        providerRefundId: 'terminal-refund-1',
        amountCents: 2000,
        currency: 'CAD',
        refundedAmountCents: 2000,
        tipCents: 0,
        chargedTotalCents: 2048,
      });

    await expect(
      adapter.getPaymentStatus({
        paymentId: 'refund-payment-internal',
        attemptId: 'refund-attempt',
        source: 'POS_TERMINAL',
        idempotencyKey: 'refund-idempotency',
        operation: 'REFUND',
        providerPaymentId: 'terminal-payment-1',
        providerRefundId: 'terminal-refund-1',
        amountCents: 2000,
        currency: 'CAD',
        expectedTipRefundCents: 0,
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED', evidence: 'CANONICAL' });
    expect(canonicalRead).toHaveBeenCalledTimes(1);
    expect(terminalStatus).not.toHaveBeenCalled();
  });

  it('blocks Terminal availability and sale before execution when Platform v3 is not configured', async () => {
    const { adapter, terminal, platformConfigured } = createAdapter();
    platformConfigured.mockReturnValue(false);
    const terminalAvailability = jest.spyOn(terminal, 'getAvailability');
    const terminalStart = jest.spyOn(terminal, 'startPayment');
    const availability = await adapter.getAvailability();

    expect(availability).toMatchObject({
      state: 'MISCONFIGURED',
      configured: false,
      available: false,
      failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
    });
    expect(terminalAvailability).not.toHaveBeenCalled();

    await expect(
      adapter.startPayment({
        paymentId: 'payment_terminal',
        attemptId: 'attempt_terminal',
        amountCents: 1000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt_terminal',
        externalPaymentId: 'external-terminal-1',
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
    });
    expect(terminalStart).not.toHaveBeenCalled();
  });

  it('routes terminal availability through the Terminal transport', async () => {
    const { adapter, terminal } = createAdapter();
    const getAvailability = jest
      .spyOn(terminal, 'getAvailability')
      .mockResolvedValue({
        state: 'AVAILABLE',
        configured: true,
        available: true,
        terminalId: 'device-1',
      });

    await expect(adapter.getAvailability()).resolves.toMatchObject({
      state: 'AVAILABLE',
      available: true,
    });
    expect(getAvailability).toHaveBeenCalledTimes(1);
  });
});

describe('R2 terminal availability state evidence', () => {
  const response = (body: Record<string, unknown> | null) =>
    mapTerminalAvailabilityResponse(
      { httpStatus: 200, ok: true, body, rawText: '' },
      'compact-test-1',
    );

  it('preserves the ordinary AVAILABLE fallback but flags empty HTTP 200 as inferred', () => {
    expect(response(null)).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      terminalId: 'compact-test-1',
      providerState: 'AVAILABLE',
      providerStateExplicit: false,
    });
    expect(response({})).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerStateExplicit: false,
    });
    expect(response({ device: {} })).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerStateExplicit: false,
    });
    expect(response({ state: '' })).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerStateExplicit: false,
    });
  });

  it('preserves explicit raw states for R2 without changing ordinary availability mapping', () => {
    expect(response({ status: 'IDLE' })).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerState: 'IDLE',
      providerStateExplicit: true,
    });
    expect(response({ state: 'READY' })).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerState: 'READY',
      providerStateExplicit: true,
    });
    expect(response({ device: { status: 'AVAILABLE' } })).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerState: 'AVAILABLE',
      providerStateExplicit: true,
    });
    expect(response({ state: 'BUSY' })).toMatchObject({
      state: 'BUSY',
      available: false,
      providerState: 'BUSY',
      providerStateExplicit: true,
    });
    expect(response({ status: 'PROCESSING' })).toMatchObject({
      state: 'BUSY',
      available: false,
      providerState: 'PROCESSING',
      providerStateExplicit: true,
    });
    expect(response({ status: 'UNKNOWN' })).toMatchObject({
      state: 'AVAILABLE',
      available: true,
      providerState: 'UNKNOWN',
      providerStateExplicit: true,
    });
  });
});

describe('CloverTerminalTransport', () => {
  const terminalToken = ['terminal', 'oauth', 'fixture'].join('-');
  const ecommerceToken = ['ecommerce', 'fixture'].join('-');
  const unifiedMerchantId = 'UNIFIED_MERCHANT_123';
  const setEnv = (key: string, value: string): void => {
    process.env[key] = value;
  };
  const deleteEnv = (key: string): void => {
    delete process.env[key];
  };
  const createAccessTokens = (
    getAccessToken = jest.fn().mockResolvedValue({ token: terminalToken }),
  ): CloverMerchantAccessTokenService =>
    ({
      hasUsableCredential: jest.fn().mockResolvedValue(true),
      getAccessToken,
    }) as unknown as CloverMerchantAccessTokenService;
  const createTerminalTransport = (
    accessTokens = createAccessTokens(),
  ): CloverTerminalTransport =>
    new CloverTerminalTransport(new CloverProviderConfig(), accessTokens);
  const original = {
    ecommerceBase: process.env.CLOVER_BASE,
    ecommerceToken: process.env.CLOVER_ACCESS_TOKEN,
    merchantId: process.env.CLOVER_UNIFIED_MERCHANT_ID,
    webMerchantId: process.env.CLOVER_MERCHANT_ID,
    platformBase: process.env.CLOVER_UNIFIED_PLATFORM_API_BASE,
    runtime: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
    sandboxManual: process.env.CLOVER_TERMINAL_SANDBOX_MANUAL_ENTRY_ENABLED,
    base: process.env.CLOVER_TERMINAL_API_BASE,
    device: process.env.CLOVER_TERMINAL_DEVICE_ID,
    pos: process.env.CLOVER_TERMINAL_REMOTE_APP_ID,
    timeout: process.env.CLOVER_TERMINAL_TIMEOUT_SECONDS,
  };

  beforeEach(() => {
    setEnv('CLOVER_UNIFIED_MERCHANT_ID', unifiedMerchantId);
    setEnv('CLOVER_TERMINAL_API_BASE', 'https://clover.example.test');
    setEnv('CLOVER_TERMINAL_DEVICE_ID', 'device-1');
    setEnv('CLOVER_TERMINAL_REMOTE_APP_ID', 'raid-1');
    setEnv('CLOVER_TERMINAL_TIMEOUT_SECONDS', '10');
    deleteEnv('CLOVER_TERMINAL_SANDBOX_MANUAL_ENTRY_ENABLED');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) deleteEnv(key);
      else setEnv(key, value);
    };
    restore('CLOVER_BASE', original.ecommerceBase);
    restore('CLOVER_ACCESS_TOKEN', original.ecommerceToken);
    restore('CLOVER_UNIFIED_MERCHANT_ID', original.merchantId);
    restore('CLOVER_MERCHANT_ID', original.webMerchantId);
    restore('CLOVER_UNIFIED_PLATFORM_API_BASE', original.platformBase);
    restore('NODE_ENV', original.runtime);
    restore('DATABASE_URL', original.databaseUrl);
    restore(
      'CLOVER_TERMINAL_SANDBOX_MANUAL_ENTRY_ENABLED',
      original.sandboxManual,
    );
    restore('CLOVER_TERMINAL_API_BASE', original.base);
    restore('CLOVER_TERMINAL_DEVICE_ID', original.device);
    restore('CLOVER_TERMINAL_REMOTE_APP_ID', original.pos);
    restore('CLOVER_TERMINAL_TIMEOUT_SECONDS', original.timeout);
  });

  const manualEntrySale = {
    paymentId: 'payment-manual-test',
    attemptId: 'attempt-manual-test',
    amountCents: 1482,
    currency: 'CAD',
    paymentMethod: 'CARD' as const,
    source: 'POS_TERMINAL' as const,
    idempotencyKey: 'attempt-manual-test-key',
    externalPaymentId: 'external-manual-test',
  };

  it('preserves the original Sale body by default (no manual card entry)', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 209 }));
    await expect(
      createTerminalTransport().startPayment(manualEntrySale),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected stringified Terminal Sale request body');
    }
    expect(JSON.parse(requestBody)).toEqual({
      amount: 1482,
      capture: true,
      final: true,
      externalPaymentId: 'external-manual-test',
    });
  });

  it('adds MANUAL alongside existing entry methods only in opted-in isolated Sandbox', async () => {
    setEnv('NODE_ENV', 'development');
    setEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1:5432/restaurant');
    setEnv('CLOVER_MERCHANT_ID', 'web-production-merchant');
    setEnv(
      'CLOVER_UNIFIED_PLATFORM_API_BASE',
      'https://apisandbox.dev.clover.com',
    );
    setEnv('CLOVER_TERMINAL_API_BASE', 'https://apisandbox.dev.clover.com');
    setEnv('CLOVER_TERMINAL_SANDBOX_MANUAL_ENTRY_ENABLED', 'true');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 209 }));
    await expect(
      createTerminalTransport().startPayment(manualEntrySale),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = fetchSpy.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected stringified Terminal Sale request body');
    }
    expect(JSON.parse(requestBody)).toEqual({
      amount: 1482,
      capture: true,
      final: true,
      externalPaymentId: 'external-manual-test',
      deviceOptions: {
        cardEntryMethods: ['EMV', 'NFC', 'MANUAL', 'MAG_STRIPE'],
      },
    });
  });

  it('clears only an absent original 504 payment on an explicitly idle device', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IDLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      createTerminalTransport().clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(true);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/payments/external/external-504',
      'https://clover.example.test/connect/v1/device/status',
      'https://clover.example.test/connect/v1/device/welcome',
    ]);
    expect(
      fetchSpy.mock.calls.every(
        (call) =>
          call[1]?.method !== 'POST' ||
          call[0] !== 'https://clover.example.test/connect/v1/payments',
      ),
    ).toBe(true);
  });

  it('accepts only an explicitly correlated NOT_FOUND device read for display cleanup', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            queryStatus: 'NOT_FOUND',
            externalPaymentId: 'different',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            queryStatus: 'NOT_FOUND',
            externalPaymentId: 'external-504',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'AVAILABLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const transport = createTerminalTransport();
    await expect(
      transport.clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(false);
    await expect(
      transport.clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(true);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/payments/external/external-504',
      'https://clover.example.test/connect/v1/payments/external/external-504',
      'https://clover.example.test/connect/v1/device/status',
      'https://clover.example.test/connect/v1/device/welcome',
    ]);
  });

  it('clears the observed HTTP 200 empty JSON device read only after explicit IDLE', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IDLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(
      createTerminalTransport().clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(true);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/payments/external/external-504',
      'https://clover.example.test/connect/v1/device/status',
      'https://clover.example.test/connect/v1/device/welcome',
    ]);
  });

  it('accepts HTTP 200 empty body for display cleanup, not an arbitrary JSON primitive', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('null', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'AVAILABLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const transport = createTerminalTransport();
    await expect(
      transport.clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(false);
    await expect(
      transport.clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('does not reset a returned payment or an uninterpretable nonempty device response', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              externalPaymentId: 'external-504',
              result: 'PROCESSING',
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ queryStatus: 'PROCESSING' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    const transport = createTerminalTransport();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        transport.clearTimedOutSaleDisplay('external-504'),
      ).resolves.toBe(false);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain(
      'https://clover.example.test/connect/v1/device/cancel',
    );
    expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain(
      'https://clover.example.test/connect/v1/device/welcome',
    );
  });

  it('waits for a busy Compact to become IDLE before sending one Welcome', async () => {
    jest.useFakeTimers();
    try {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'BUSY' }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ status: 'IDLE' }), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      const pending =
        createTerminalTransport().clearTimedOutSaleDisplay('external-504');
      await jest.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toBe(true);
      expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
        'https://clover.example.test/connect/v1/payments/external/external-504',
        'https://clover.example.test/connect/v1/device/status',
        'https://clover.example.test/connect/v1/device/status',
        'https://clover.example.test/connect/v1/device/welcome',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops after three busy checks without sending Welcome or Cancel', async () => {
    jest.useFakeTimers();
    try {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockImplementation(() =>
          Promise.resolve(
            new Response(JSON.stringify({ status: 'BUSY' }), { status: 200 }),
          ),
        );
      const pending =
        createTerminalTransport().clearTimedOutSaleDisplay('external-504');
      await jest.advanceTimersByTimeAsync(4000);
      await expect(pending).resolves.toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain(
        'https://clover.example.test/connect/v1/device/welcome',
      );
      expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain(
        'https://clover.example.test/connect/v1/device/cancel',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('never infers IDLE from repeated state-less status responses', async () => {
    jest.useFakeTimers();
    try {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockImplementation(() =>
          Promise.resolve(new Response('{}', { status: 200 })),
        );
      const pending =
        createTerminalTransport().clearTimedOutSaleDisplay('external-504');
      await jest.advanceTimersByTimeAsync(4000);
      await expect(pending).resolves.toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain(
        'https://clover.example.test/connect/v1/device/welcome',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns false without financial actions if Welcome itself fails', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IDLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(
      createTerminalTransport().clearTimedOutSaleDisplay('external-504'),
    ).resolves.toBe(false);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/payments/external/external-504',
      'https://clover.example.test/connect/v1/device/status',
      'https://clover.example.test/connect/v1/device/welcome',
    ]);
  });

  it('serializes a new Sale behind an in-flight Welcome in one API process', async () => {
    let resolveWelcome: (value: Response) => void = () => undefined;
    let notifyWelcome: () => void = () => undefined;
    const welcomePending = new Promise<Response>((resolve) => {
      resolveWelcome = resolve;
    });
    const welcomeStarted = new Promise<void>((resolve) => {
      notifyWelcome = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IDLE' }), { status: 200 }),
      )
      .mockImplementationOnce(() => {
        notifyWelcome();
        return welcomePending;
      })
      .mockResolvedValueOnce(new Response('{}', { status: 209 }));
    const terminal = createTerminalTransport();
    const cleanup = terminal.clearTimedOutSaleDisplay('external-504');
    await welcomeStarted;
    const sale = terminal.startPayment({
      paymentId: 'payment-2',
      attemptId: 'attempt-2',
      amountCents: 2000,
      currency: 'CAD',
      paymentMethod: 'CARD',
      source: 'POS_TERMINAL',
      idempotencyKey: 'attempt-2-sale',
      externalPaymentId: 'external-2',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    resolveWelcome(new Response(null, { status: 200 }));
    await expect(cleanup).resolves.toBe(true);
    await expect(sale).resolves.toMatchObject({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
    });
    expect(fetchSpy.mock.calls[3]?.[0]).toBe(
      'https://clover.example.test/connect/v1/payments',
    );
  });

  it('waits for an in-flight Sale to finish before checking or clearing its display', async () => {
    let resolveSale: (value: Response) => void = () => undefined;
    let notifySale: () => void = () => undefined;
    const salePending = new Promise<Response>((resolve) => {
      resolveSale = resolve;
    });
    const saleStarted = new Promise<void>((resolve) => {
      notifySale = resolve;
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() => {
        notifySale();
        return salePending;
      })
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'IDLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const terminal = createTerminalTransport();
    const sale = terminal.startPayment({
      paymentId: 'payment-2',
      attemptId: 'attempt-2',
      amountCents: 2000,
      currency: 'CAD',
      paymentMethod: 'CARD',
      source: 'POS_TERMINAL',
      idempotencyKey: 'attempt-2-sale',
      externalPaymentId: 'external-2',
    });
    await saleStarted;
    const cleanup = terminal.clearTimedOutSaleDisplay('external-504');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolveSale(new Response('{}', { status: 209 }));
    await expect(sale).resolves.toMatchObject({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
    });
    await expect(cleanup).resolves.toBe(true);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/payments',
      'https://clover.example.test/connect/v1/payments/external/external-504',
      'https://clover.example.test/connect/v1/device/status',
      'https://clover.example.test/connect/v1/device/welcome',
    ]);
  });

  it('does not send Welcome when a device is still busy', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ state: 'BUSY' }), { status: 200 }),
      );
    await expect(
      createTerminalTransport().prepareOriginalSaleResume(),
    ).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/status',
    );
  });

  it('does not infer idle from a successful but state-less status response', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(
      createTerminalTransport().prepareOriginalSaleResume(),
    ).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('resets a confirmed-idle Compact to Welcome before original payment resume', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ state: 'AVAILABLE' }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await expect(
      createTerminalTransport().prepareOriginalSaleResume(),
    ).resolves.toBe(true);
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/device/status',
      'https://clover.example.test/connect/v1/device/welcome',
    ]);
  });

  it('tags only the original Sale HTTP 209 with definitive terminal cancellation evidence', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{}', { status: 209 })),
      );
    const transport = createTerminalTransport();
    await expect(
      transport.startPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        amountCents: 2000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
      resultCode: 'CLOVER_CANCELLED',
    });
    await expect(
      transport.cancelPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.not.toMatchObject({
      evidence: 'TERMINAL_SALE_CANCELLED',
    });
  });

  it('lets device Cancel interrupt the original waiting Sale without entering the Sale/Welcome queue', async () => {
    let releaseSale!: (response: Response) => void;
    let saleStarted!: () => void;
    const seenSale = new Promise<void>((resolve) => {
      saleStarted = resolve;
    });
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.endsWith('/connect/v1/payments')) {
        saleStarted();
        return new Promise<Response>((resolve) => {
          releaseSale = resolve;
        });
      }
      if (url.endsWith('/connect/v1/device/cancel')) {
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      throw new Error(`Unexpected Clover request: ${url}`);
    });
    const terminal = createTerminalTransport();
    const sale = terminal.startPayment({
      paymentId: 'payment-1',
      attemptId: 'attempt-1',
      amountCents: 2000,
      currency: 'CAD',
      paymentMethod: 'CARD',
      source: 'POS_TERMINAL',
      idempotencyKey: 'attempt-1-sale',
      externalPaymentId: 'external-1',
    });
    await seenSale;
    // If Cancel were enqueued behind Sale this await would never resolve.
    const ack = await terminal.cancelPayment({
      paymentId: 'payment-1',
      attemptId: 'attempt-1',
      source: 'POS_TERMINAL',
      idempotencyKey: 'attempt-1-sale',
      externalPaymentId: 'external-1',
    });
    expect(ack.status).toBe('UNKNOWN');
    expect(ack.failureCode).toBe('CLOVER_TERMINAL_CANCEL_ACKNOWLEDGED');
    releaseSale(new Response('{}', { status: 209 }));
    expect(await sale).toMatchObject({
      status: 'CANCELLED',
      evidence: 'TERMINAL_SALE_CANCELLED',
    });
    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://clover.example.test/connect/v1/payments',
      'https://clover.example.test/connect/v1/device/cancel',
    ]);
  });

  it('sends Cloud REST Pay Display sale with the Unified database OAuth token and Terminal headers', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          payment: {
            id: 'clover-payment-1',
            externalPaymentId: 'external-1',
            amount: 2000,
            result: 'SUCCESS',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const getAccessToken = jest
      .fn()
      .mockResolvedValue({ token: terminalToken });
    const transport = createTerminalTransport(
      createAccessTokens(getAccessToken),
    );

    await expect(
      transport.startPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        amountCents: 2000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
      terminalId: 'device-1',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://clover.example.test/connect/v1/payments');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${terminalToken}`,
      'X-Clover-Device-Id': 'device-1',
      'X-POS-Id': 'raid-1',
      'X-Clover-Timeout': '0',
      'Idempotency-Key': 'attempt-1-sale',
    });
    expect(getAccessToken).toHaveBeenCalledWith(unifiedMerchantId, {});
    const requestBody = init?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected Clover Terminal request body to be JSON text');
    }
    expect(JSON.parse(requestBody)).toEqual({
      amount: 2000,
      capture: true,
      final: true,
      externalPaymentId: 'external-1',
    });
    expect(init?.headers).toMatchObject({ 'X-Clover-Timeout': '0' });
  });

  it('returns the Compact to Welcome after completed payment without another Sale', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = createTerminalTransport();

    await expect(
      transport.completeCustomerInteraction('SUCCEEDED'),
    ).resolves.toBe(false);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/welcome',
    );
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('shows a decline reason with Retry and returns the customer confirmation', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const transport = createTerminalTransport();

    await expect(
      transport.completeCustomerInteraction('DECLINED', 'INSUFFICIENT_FUNDS'),
    ).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/welcome',
    );
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/read-confirmation',
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ 'X-Clover-Timeout': '0' });
    expect(init?.method).toBe('POST');
    if (typeof init?.body !== 'string') {
      throw new Error(
        'Expected Clover confirmation request body to be JSON text',
      );
    }
    expect(JSON.parse(init.body)).toEqual({
      text: 'Insufficient funds. Try another card?',
      acceptText: 'Retry',
      rejectText: 'Cancel',
      beep: true,
    });
  });

  it('returns to Welcome when the customer rejects Retry', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ response: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const transport = createTerminalTransport();

    await expect(
      transport.completeCustomerInteraction('DECLINED'),
    ).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/welcome',
    );
  });

  it('shows staff guidance for a nonretryable provider error without charging again', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = createTerminalTransport();

    await expect(
      transport.completeCustomerInteraction('FAILED', 'invalid_request'),
    ).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/display',
    );
    const init = fetchSpy.mock.calls[0]?.[1];
    if (typeof init?.body !== 'string') {
      throw new Error('Expected Clover display request body to be JSON text');
    }
    expect(JSON.parse(init.body)).toEqual({
      text: 'Payment unavailable. Please ask the cashier.',
      beep: true,
    });
  });

  it('does not offer a device Retry for callers that disable confirmation', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = createTerminalTransport();

    await expect(
      transport.completeCustomerInteraction('DECLINED', null, false),
    ).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://clover.example.test/connect/v1/device/display',
    );
  });

  it('does not force Welcome or re-charge if customer confirmation has an uncertain response', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connection interrupted'));
    const transport = createTerminalTransport();

    await expect(
      transport.completeCustomerInteraction('DECLINED'),
    ).resolves.toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('force-refreshes the Unified OAuth credential once after Terminal HTTP 401', async () => {
    const refreshedToken = ['terminal', 'oauth', 'refreshed'].join('-');
    const getAccessToken = jest
      .fn()
      .mockResolvedValueOnce({ token: terminalToken })
      .mockResolvedValueOnce({ token: refreshedToken });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              id: 'clover-payment-1',
              externalPaymentId: 'external-1',
              amount: 2000,
              result: 'SUCCESS',
            },
          }),
          { status: 200 },
        ),
      );
    const transport = createTerminalTransport(
      createAccessTokens(getAccessToken),
    );

    await expect(
      transport.startPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        amountCents: 2000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
    });

    expect(getAccessToken.mock.calls).toEqual([
      [unifiedMerchantId, {}],
      [unifiedMerchantId, { forceRefresh: true }],
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bearer ${terminalToken}`,
    });
    expect(fetchSpy.mock.calls[1][1]?.headers).toMatchObject({
      Authorization: `Bearer ${refreshedToken}`,
    });
  });

  it('sends full refund to the original Clover payment with the saved idempotency key', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          refund: {
            id: 'refund-1',
            payment: { id: 'payment-1' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const transport = createTerminalTransport();

    await expect(
      transport.refundPayment({
        paymentId: 'refund-internal-1',
        attemptId: 'refund-attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'refund-idempotency-1',
        operation: 'REFUND',
        providerPaymentId: 'payment-1',
        amountCents: 2000,
        currency: 'CAD',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'EXECUTION',
      providerPaymentId: 'payment-1',
      providerRefundId: 'refund-1',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://clover.example.test/connect/v1/payments/payment-1/refunds',
    );
    expect(init?.headers).toMatchObject({
      'Idempotency-Key': 'refund-idempotency-1',
    });
    if (typeof init?.body !== 'string') {
      throw new Error('Expected Clover refund request body to be JSON text');
    }
    expect(JSON.parse(init.body)).toEqual({ fullRefund: true });
  });

  it('sends USER_CANCEL void to the original Clover payment', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          payment: { id: 'payment-1' },
          paymentId: 'payment-1',
          voidStatus: 'SENT_TO_SERVER',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const transport = createTerminalTransport();

    await expect(
      transport.voidPayment({
        paymentId: 'void-internal-1',
        attemptId: 'void-attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'void-idempotency-1',
        operation: 'VOID',
        providerPaymentId: 'payment-1',
        amountCents: 2000,
        currency: 'CAD',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'EXECUTION',
      providerPaymentId: 'payment-1',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://clover.example.test/connect/v1/payments/payment-1/void',
    );
    if (typeof init?.body !== 'string') {
      throw new Error('Expected Clover void request body to be JSON text');
    }
    expect(JSON.parse(init.body)).toEqual({ voidReason: 'USER_CANCEL' });
  });

  it('maps a lost payment response to UNKNOWN', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('socket closed'));
    const transport = createTerminalTransport();

    await expect(
      transport.startPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        amountCents: 2000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_TERMINAL_PAYMENT_REQUEST_UNCERTAIN',
    });
  });

  it('reconciles by provider payment id then falls back to externalPaymentId on 404', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            payment: {
              id: 'clover-payment-1',
              externalPaymentId: 'external-1',
              amount: 2000,
              result: 'SUCCESS',
            },
          }),
          { status: 200 },
        ),
      );
    const transport = createTerminalTransport();

    await expect(
      transport.getPaymentStatus({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        providerPaymentId: 'clover-payment-1',
        externalPaymentId: 'external-1',
        amountCents: 2000,
        currency: 'CAD',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
    });

    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://clover.example.test/connect/v1/payments/clover-payment-1',
    );
    expect(fetchSpy.mock.calls[1][0]).toBe(
      'https://clover.example.test/connect/v1/payments/external/external-1',
    );
  });

  it('does not interpret a 200 cancel acknowledgement as final cancellation', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const transport = createTerminalTransport();

    await expect(
      transport.cancelPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_TERMINAL_CANCEL_ACKNOWLEDGED',
    });
  });

  it('does not fall back to Ecommerce credentials when the Unified database credential is unavailable', async () => {
    setEnv('CLOVER_ACCESS_TOKEN', ecommerceToken);
    const getAccessToken = jest.fn().mockResolvedValue(null);
    const fetchSpy = jest.spyOn(global, 'fetch');
    const transport = createTerminalTransport(
      createAccessTokens(getAccessToken),
    );

    await expect(transport.getAvailability()).resolves.toMatchObject({
      state: 'MISCONFIGURED',
      configured: false,
      available: false,
      failureCode: 'CLOVER_TERMINAL_CREDENTIAL_UNAVAILABLE',
    });
    expect(getAccessToken).toHaveBeenCalledWith(unifiedMerchantId, {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails sale, refund, and void before outbound HTTP when the Unified credential is unavailable', async () => {
    const getAccessToken = jest.fn().mockResolvedValue(null);
    const fetchSpy = jest.spyOn(global, 'fetch');
    const transport = createTerminalTransport(
      createAccessTokens(getAccessToken),
    );

    await expect(
      transport.startPayment({
        paymentId: 'payment-1',
        attemptId: 'attempt-1',
        amountCents: 2000,
        currency: 'CAD',
        paymentMethod: 'CARD',
        source: 'POS_TERMINAL',
        idempotencyKey: 'attempt-1-sale',
        externalPaymentId: 'external-1',
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'CLOVER_TERMINAL_CREDENTIAL_UNAVAILABLE',
    });
    await expect(
      transport.refundPayment({
        paymentId: 'refund-1',
        attemptId: 'refund-attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'refund-1',
        operation: 'REFUND',
        providerPaymentId: 'provider-payment-1',
        amountCents: 2000,
        currency: 'CAD',
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'CLOVER_TERMINAL_CREDENTIAL_UNAVAILABLE',
    });
    await expect(
      transport.voidPayment({
        paymentId: 'void-1',
        attemptId: 'void-attempt-1',
        source: 'POS_TERMINAL',
        idempotencyKey: 'void-1',
        operation: 'VOID',
        providerPaymentId: 'provider-payment-1',
        amountCents: 2000,
        currency: 'CAD',
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureCode: 'CLOVER_TERMINAL_CREDENTIAL_UNAVAILABLE',
    });

    expect(getAccessToken).toHaveBeenCalledTimes(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fall back to the Web Ecommerce base when Terminal API base is missing', async () => {
    setEnv('CLOVER_BASE', 'https://web-production.example');
    deleteEnv('CLOVER_TERMINAL_API_BASE');
    const fetchSpy = jest.spyOn(global, 'fetch');
    const transport = createTerminalTransport();

    await expect(transport.getAvailability()).resolves.toMatchObject({
      state: 'MISCONFIGURED',
      configured: false,
      available: false,
      failureCode: 'CLOVER_TERMINAL_MISCONFIGURED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats an invalid Terminal timeout as misconfigured instead of using a default', async () => {
    setEnv('CLOVER_TERMINAL_TIMEOUT_SECONDS', '9');
    const fetchSpy = jest.spyOn(global, 'fetch');
    const transport = createTerminalTransport();

    await expect(transport.getAvailability()).resolves.toMatchObject({
      state: 'MISCONFIGURED',
      configured: false,
      available: false,
      failureCode: 'CLOVER_TERMINAL_MISCONFIGURED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Clover Terminal response mapping', () => {
  it('distinguishes original Sale HTTP 209 from non-definitive cancellation text', () => {
    expect(
      mapTerminalPaymentResponse(
        { httpStatus: 209, ok: false, rawText: '', body: null },
        2000,
        'external-1',
        'device-1',
      ),
    ).toMatchObject({
      status: 'CANCELLED',
      resultCode: 'CLOVER_CANCELLED',
    });
    expect(
      mapTerminalPaymentResponse(
        {
          httpStatus: 200,
          ok: true,
          rawText: '',
          body: { result: 'CANCELLED' },
        },
        2000,
        'external-1',
        'device-1',
      ),
    ).toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_TERMINAL_CANCEL_TEXT_UNVERIFIED',
    });
    expect(
      mapTerminalPaymentResponse(
        {
          httpStatus: 400,
          ok: false,
          rawText: '',
          body: { message: 'cancel not acknowledged' },
        },
        2000,
        'external-1',
        'device-1',
      ),
    ).toMatchObject({ status: 'UNKNOWN' });
  });

  it('records Clover surcharge and total charged amount from provider facts', () => {
    expect(
      mapTerminalPaymentResponse(
        {
          httpStatus: 200,
          ok: true,
          rawText: '',
          body: {
            payment: {
              id: 'clover-payment-1',
              externalPaymentId: 'external-1',
              amount: 2000,
              result: 'SUCCESS',
              additionalCharges: [
                { type: 'CREDIT_SURCHARGE', amount: 48 },
                { type: 'OTHER', amount: 10 },
              ],
            },
          },
        },
        2000,
        'external-1',
        'device-1',
      ),
    ).toMatchObject({
      status: 'SUCCEEDED',
      chargedTotalCents: 2058,
      surchargeCents: 48,
    });
  });

  it('keeps HTTP 504 outcome UNKNOWN rather than FAILED', () => {
    expect(
      mapTerminalPaymentResponse(
        { httpStatus: 504, ok: false, body: null, rawText: '' },
        2000,
        'external-1',
        'device-1',
      ),
    ).toMatchObject({
      status: 'UNKNOWN',
      resultCode: 'CLOVER_TERMINAL_SALE_HTTP_504',
    });
  });

  it('maps an explicit decline as DECLINED', () => {
    expect(
      mapTerminalPaymentResponse(
        {
          httpStatus: 400,
          ok: false,
          rawText: '',
          body: { code: 'DECLINED', message: 'Card declined' },
        },
        2000,
        'external-1',
        'device-1',
      ),
    ).toMatchObject({ status: 'DECLINED' });
  });
});

describe('Clover Platform Payments Gateway', () => {
  const platformRequest = {
    paymentId: 'payment-internal-1',
    attemptId: 'attempt-1',
    idempotencyKey: 'attempt-1-sale',
    externalPaymentId: 'external-1',
    providerPaymentId: 'clover-payment-1',
    amountCents: 2000,
    currency: 'CAD',
  };
  const platformPayment = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 'clover-payment-1',
    externalPaymentId: 'external-1',
    amount: 2000,
    tipAmount: 0,
    result: 'success',
    order: { id: 'clover-order-1', currency: 'CAD' },
    cardTransaction: { cardType: 'VISA', last4: '4242' },
    additionalCharges: {
      elements: [{ type: 'CREDIT_SURCHARGE', amount: 48 }],
    },
    refunds: { elements: [] },
    ...overrides,
  });
  const original = {
    base: process.env.CLOVER_UNIFIED_PLATFORM_API_BASE,
    ecommerceToken: process.env.CLOVER_ACCESS_TOKEN,
    merchantId: process.env.CLOVER_UNIFIED_MERCHANT_ID,
  };
  const setPlatformEnv = (key: string, value: string): void => {
    process.env[key] = value;
  };
  const restorePlatformEnv = (key: string, value: string | undefined): void => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  const createAccessTokens = () =>
    ({
      hasUsableCredential: jest.fn().mockResolvedValue(true),
      getAccessToken: jest
        .fn()
        .mockResolvedValue({ token: 'merchant-oauth-token' }),
    }) as unknown as CloverMerchantAccessTokenService;
  const createPlatformGateway = (
    accessTokens: CloverMerchantAccessTokenService = createAccessTokens(),
  ) =>
    new CloverPlatformPaymentsGateway(new CloverProviderConfig(), accessTokens);

  beforeEach(() => {
    setPlatformEnv(
      'CLOVER_UNIFIED_PLATFORM_API_BASE',
      'https://platform.example.test',
    );
    setPlatformEnv('CLOVER_UNIFIED_MERCHANT_ID', 'merchant-1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restorePlatformEnv('CLOVER_UNIFIED_PLATFORM_API_BASE', original.base);
    restorePlatformEnv('CLOVER_ACCESS_TOKEN', original.ecommerceToken);
    restorePlatformEnv('CLOVER_UNIFIED_MERCHANT_ID', original.merchantId);
  });

  it('reads canonical payment by provider id with dedicated Platform v3 credentials', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(platformPayment()), { status: 200 }),
      );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      paymentId: 'payment-internal-1',
      attemptId: 'attempt-1',
      externalPaymentId: 'external-1',
      providerPaymentId: 'clover-payment-1',
      amountCents: 2000,
      currency: 'CAD',
      tipCents: 0,
      surchargeCents: 48,
      chargedTotalCents: 2048,
      cardBrand: 'VISA',
      cardLast4: '4242',
    });
    const firstUrl = fetchSpy.mock.calls[0]?.[0];
    if (typeof firstUrl !== 'string') {
      throw new Error('Expected Platform request URL to be a string');
    }
    expect(firstUrl).toContain(
      'https://platform.example.test/v3/merchants/merchant-1/payments/clover-payment-1',
    );
    expect(firstUrl).toContain('expand=');
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer merchant-oauth-token',
    });
  });

  it('uses payment collection filter by externalPaymentId when provider id is unknown', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ elements: [platformPayment()] }), {
        status: 200,
      }),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalPayment({
        ...platformRequest,
        providerPaymentId: null,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerPaymentId: 'clover-payment-1',
    });
    const collectionUrl = fetchSpy.mock.calls[0]?.[0];
    if (typeof collectionUrl !== 'string') {
      throw new Error('Expected Platform collection URL to be a string');
    }
    expect(collectionUrl).toContain('filter=externalPaymentId%3Dexternal-1');
  });

  it('does not finalize when canonical amount mismatches the prepared amount', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(platformPayment({ amount: 1999 })), {
        status: 200,
      }),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_AMOUNT_MISMATCH',
    });
  });

  it('does not finalize when canonical payment id mismatches the expected provider id', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify(platformPayment({ id: 'different-payment' })),
          { status: 200 },
        ),
      );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_PAYMENT_ID_MISMATCH',
    });
  });

  it('maps provider tip separately and includes tip plus all additional charges in charged total', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          platformPayment({
            tipAmount: 400,
            additionalCharges: {
              elements: [
                { type: 'CREDIT_SURCHARGE', amount: 58 },
                { type: 'OTHER', amount: 15 },
              ],
            },
          }),
        ),
        { status: 200 },
      ),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      tipCents: 400,
      surchargeCents: 58,
      chargedTotalCents: 2473,
    });
  });

  it('fails closed when Platform omits provider tip authority', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify(platformPayment({ tipAmount: undefined })),
          { status: 200 },
        ),
      );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_TIP_AMOUNT_MISSING_OR_INVALID',
    });
  });

  it('confirms a canonical full refund from the refund resource including refunded surcharge facts', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'clover-refund-1',
          amount: 2000,
          tipAmount: 400,
          payment: { id: 'clover-payment-1' },
          additionalCharges: {
            elements: [{ type: 'CREDIT_SURCHARGE', amount: 58 }],
          },
        }),
        { status: 200 },
      ),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalReversal({
        ...platformRequest,
        operation: 'REFUND',
        providerRefundId: 'clover-refund-1',
        expectedTipRefundCents: 400,
        expectedAdditionalChargeRefundCents: 58,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerPaymentId: 'clover-payment-1',
      providerRefundId: 'clover-refund-1',
      refundedAmountCents: 2000,
      tipCents: 400,
      surchargeCents: 58,
      chargedTotalCents: 2458,
      resultCode: 'CLOVER_REFUND_CONFIRMED',
    });
    const url = fetchSpy.mock.calls[0]?.[0];
    if (typeof url !== 'string') {
      throw new Error('Expected Platform refund URL to be a string');
    }
    expect(url).toContain('/v3/merchants/merchant-1/refunds/clover-refund-1');
    expect(url).toContain('expand=');
  });

  it('keeps canonical refund UNKNOWN when provider tip does not match the original sale', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'clover-refund-1',
          amount: 2000,
          tipAmount: 0,
          payment: { id: 'clover-payment-1' },
          additionalCharges: {
            elements: [{ type: 'CREDIT_SURCHARGE', amount: 58 }],
          },
        }),
        { status: 200 },
      ),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalReversal({
        ...platformRequest,
        operation: 'REFUND',
        providerRefundId: 'clover-refund-1',
        expectedTipRefundCents: 400,
        expectedAdditionalChargeRefundCents: 58,
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_REFUND_TIP_MISMATCH',
    });
  });

  it('confirms a canonical void from the payment result without requiring a refund row', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(platformPayment({ result: 'voided' })), {
        status: 200,
      }),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalReversal({
        ...platformRequest,
        operation: 'VOID',
        expectedTipRefundCents: 0,
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerPaymentId: 'clover-payment-1',
      refundedAmountCents: 2000,
      tipCents: 0,
      surchargeCents: 48,
      chargedTotalCents: 2048,
      resultCode: 'CLOVER_VOID_CONFIRMED',
    });
  });

  it('accepts a void that Clover converted into a canonical refund', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            platformPayment({
              refunds: { elements: [{ id: 'clover-refund-1' }] },
            }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'clover-refund-1',
            amount: 2000,
            tipAmount: 400,
            payment: { id: 'clover-payment-1' },
            additionalCharges: {
              elements: [{ type: 'CREDIT_SURCHARGE', amount: 58 }],
            },
          }),
          { status: 200 },
        ),
      );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalReversal({
        ...platformRequest,
        operation: 'VOID',
        expectedTipRefundCents: 400,
        expectedAdditionalChargeRefundCents: 58,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerRefundId: 'clover-refund-1',
      refundedAmountCents: 2000,
      tipCents: 400,
      chargedTotalCents: 2458,
      resultCode: 'CLOVER_VOID_CONVERTED_TO_REFUND',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps managed full refund truth UNKNOWN when multiple canonical refund rows exist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          platformPayment({
            refunds: {
              elements: [{ id: 'refund-1' }, { id: 'refund-2' }],
            },
          }),
        ),
        { status: 200 },
      ),
    );
    const gateway = createPlatformGateway();

    await expect(
      gateway.getCanonicalReversal({
        ...platformRequest,
        operation: 'REFUND',
        expectedTipRefundCents: 0,
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_REVERSAL_REFUND_IDENTITY_CONFLICT',
    });
  });

  it('uses the persisted merchant-scoped OAuth token for Platform v3', async () => {
    const getAccessToken = jest.fn().mockResolvedValue({
      token: 'database-merchant-token',
    });
    const accessTokens = {
      hasUsableCredential: jest.fn().mockResolvedValue(true),
      getAccessToken,
    } as unknown as CloverMerchantAccessTokenService;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(platformPayment()), { status: 200 }),
      );
    const gateway = new CloverPlatformPaymentsGateway(
      new CloverProviderConfig(),
      accessTokens,
    );

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(getAccessToken.mock.calls).toEqual([['merchant-1']]);
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer database-merchant-token',
    });
  });

  it('forces one merchant token refresh and retries a Platform v3 read once after a database-token 401', async () => {
    const getAccessToken = jest
      .fn()
      .mockResolvedValueOnce({ token: 'expired-db-token' })
      .mockResolvedValueOnce({ token: 'refreshed-db-token' });
    const accessTokens = {
      hasUsableCredential: jest.fn().mockResolvedValue(true),
      getAccessToken,
    } as unknown as CloverMerchantAccessTokenService;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(platformPayment()), { status: 200 }),
      );
    const gateway = new CloverPlatformPaymentsGateway(
      new CloverProviderConfig(),
      accessTokens,
    );

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getAccessToken.mock.calls).toEqual([
      ['merchant-1'],
      ['merchant-1', { forceRefresh: true }],
    ]);
    expect(fetchSpy.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer refreshed-db-token',
    });
  });

  it('does not fall back to Ecommerce credentials when merchant OAuth authorization is unavailable', async () => {
    setPlatformEnv('CLOVER_ACCESS_TOKEN', 'ecommerce-only-fixture-token');
    const getAccessToken = jest.fn().mockResolvedValue(null);
    const accessTokens = {
      hasUsableCredential: jest.fn().mockResolvedValue(false),
      getAccessToken,
    } as unknown as CloverMerchantAccessTokenService;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const gateway = createPlatformGateway(accessTokens);

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
    });
    expect(getAccessToken.mock.calls).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed before credential lookup when the Unified Platform base is missing', async () => {
    delete process.env.CLOVER_UNIFIED_PLATFORM_API_BASE;
    const hasUsableCredential = jest.fn().mockResolvedValue(true);
    const getAccessToken = jest
      .fn()
      .mockResolvedValue({ token: 'merchant-token' });
    const accessTokens = {
      hasUsableCredential,
      getAccessToken,
    } as unknown as CloverMerchantAccessTokenService;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const gateway = createPlatformGateway(accessTokens);

    await expect(
      gateway.getCanonicalPayment(platformRequest),
    ).resolves.toMatchObject({
      status: 'UNKNOWN',
      failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
    });
    expect(hasUsableCredential).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
