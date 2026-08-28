import {
  CloverPaymentProviderAdapter,
  CloverPlatformPaymentsGateway,
} from './clover-payment-provider.adapter';
import { CloverProviderConfig } from './clover-provider.config';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import type { CloverMerchantAccessTokenService } from './oauth/clover-merchant-access-token.service';
import {
  CloverTerminalTransport,
  mapTerminalPaymentResponse,
} from './terminal/clover-terminal.transport';

describe('CloverPaymentProviderAdapter', () => {
  const createAdapter = () => {
    const config = new CloverProviderConfig();
    const ecommerce = new CloverEcommerceTransport(config);
    const terminal = new CloverTerminalTransport(config);
    const accessTokens = {
      hasUsableCredential: jest.fn().mockResolvedValue(true),
      getAccessToken: jest.fn().mockResolvedValue({ token: 'platform-token' }),
    } as unknown as CloverMerchantAccessTokenService;
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

describe('CloverTerminalTransport', () => {
  const terminalToken = ['terminal', 'oauth', 'fixture'].join('-');
  const ecommerceToken = ['ecommerce', 'fixture'].join('-');
  const setEnv = (key: string, value: string): void => {
    process.env[key] = value;
  };
  const deleteEnv = (key: string): void => {
    delete process.env[key];
  };
  const original = {
    ecommerceToken: process.env.CLOVER_ACCESS_TOKEN,
    base: process.env.CLOVER_TERMINAL_BASE,
    token: process.env.CLOVER_TERMINAL_OAUTH_TOKEN,
    device: process.env.CLOVER_DEVICE_ID,
    pos: process.env.CLOVER_REMOTE_APP_ID,
    timeout: process.env.CLOVER_TERMINAL_TIMEOUT_SECONDS,
  };

  beforeEach(() => {
    setEnv('CLOVER_TERMINAL_BASE', 'https://clover.example.test');
    setEnv('CLOVER_TERMINAL_OAUTH_TOKEN', terminalToken);
    setEnv('CLOVER_DEVICE_ID', 'device-1');
    setEnv('CLOVER_REMOTE_APP_ID', 'raid-1');
    setEnv('CLOVER_TERMINAL_TIMEOUT_SECONDS', '10');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) deleteEnv(key);
      else setEnv(key, value);
    };
    restore('CLOVER_ACCESS_TOKEN', original.ecommerceToken);
    restore('CLOVER_TERMINAL_BASE', original.base);
    restore('CLOVER_TERMINAL_OAUTH_TOKEN', original.token);
    restore('CLOVER_DEVICE_ID', original.device);
    restore('CLOVER_REMOTE_APP_ID', original.pos);
    restore('CLOVER_TERMINAL_TIMEOUT_SECONDS', original.timeout);
  });

  it('sends Cloud REST Pay Display sale with device, RAID, timeout, and idempotency headers', async () => {
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
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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
      'X-Clover-Timeout': '10',
      'Idempotency-Key': 'attempt-1-sale',
    });
    const requestBody = init?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected Clover Terminal request body to be JSON text');
    }
    expect(JSON.parse(requestBody)).toEqual({
      amount: 2000,
      externalPaymentId: 'external-1',
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
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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

  it('does not fall back to Ecommerce credentials for Terminal OAuth', async () => {
    setEnv('CLOVER_ACCESS_TOKEN', ecommerceToken);
    deleteEnv('CLOVER_TERMINAL_OAUTH_TOKEN');
    const fetchSpy = jest.spyOn(global, 'fetch');
    const transport = new CloverTerminalTransport(new CloverProviderConfig());

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
    ).toMatchObject({ status: 'UNKNOWN' });
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
    base: process.env.CLOVER_PLATFORM_API_BASE,
    ecommerceToken: process.env.CLOVER_ACCESS_TOKEN,
    merchantId: process.env.CLOVER_MERCHANT_ID,
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
  ) => new CloverPlatformPaymentsGateway(new CloverProviderConfig(), accessTokens);

  beforeEach(() => {
    setPlatformEnv('CLOVER_PLATFORM_API_BASE', 'https://platform.example.test');
    setPlatformEnv('CLOVER_MERCHANT_ID', 'merchant-1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restorePlatformEnv('CLOVER_PLATFORM_API_BASE', original.base);
    restorePlatformEnv('CLOVER_ACCESS_TOKEN', original.ecommerceToken);
    restorePlatformEnv('CLOVER_MERCHANT_ID', original.merchantId);
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

  it('maps CREDIT_SURCHARGE separately while charged total includes all additional charges', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          platformPayment({
            additionalCharges: {
              elements: [
                { type: 'CREDIT_SURCHARGE', amount: 48 },
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
      surchargeCents: 48,
      chargedTotalCents: 2063,
    });
  });

  it('confirms a canonical full refund from the refund resource including refunded surcharge facts', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'clover-refund-1',
          amount: 2000,
          payment: { id: 'clover-payment-1' },
          additionalCharges: {
            elements: [{ type: 'CREDIT_SURCHARGE', amount: 48 }],
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
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerPaymentId: 'clover-payment-1',
      providerRefundId: 'clover-refund-1',
      refundedAmountCents: 2000,
      surchargeCents: 48,
      chargedTotalCents: 2048,
      resultCode: 'CLOVER_REFUND_CONFIRMED',
    });
    const url = fetchSpy.mock.calls[0]?.[0];
    if (typeof url !== 'string') {
      throw new Error('Expected Platform refund URL to be a string');
    }
    expect(url).toContain('/v3/merchants/merchant-1/refunds/clover-refund-1');
    expect(url).toContain('expand=');
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
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      evidence: 'CANONICAL',
      providerPaymentId: 'clover-payment-1',
      refundedAmountCents: 2000,
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
            payment: { id: 'clover-payment-1' },
            additionalCharges: {
              elements: [{ type: 'CREDIT_SURCHARGE', amount: 48 }],
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
        expectedAdditionalChargeRefundCents: 48,
      }),
    ).resolves.toMatchObject({
      status: 'SUCCEEDED',
      providerRefundId: 'clover-refund-1',
      refundedAmountCents: 2000,
      chargedTotalCents: 2048,
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
});
