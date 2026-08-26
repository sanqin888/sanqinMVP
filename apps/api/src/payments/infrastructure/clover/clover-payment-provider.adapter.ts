import { Injectable } from '@nestjs/common';

import type {
  CancelPaymentRequest,
  GetPaymentStatusRequest,
  PaymentProvider,
  PaymentTerminalAvailability,
  PaymentTerminalProvider,
  RefundPaymentRequest,
  StartPaymentRequest,
  VoidPaymentRequest,
} from '../../application/payment-provider.port';
import type { PaymentProviderOutcome } from '../../domain/payment.types';
import { CloverEcommerceTransport } from './ecommerce/clover-ecommerce.transport';
import {
  toProviderOutcomeFromCreate,
  toProviderOutcomeFromStatus,
} from './ecommerce/clover-ecommerce.mapper';
import { CloverPlatformPaymentsGateway } from './platform/clover-platform-payments.gateway';
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';

const unsupportedSource = (source: string): PaymentProviderOutcome => ({
  status: 'FAILED',
  failureCode: 'CLOVER_UNSUPPORTED_PAYMENT_SOURCE',
  failureMessage: `Clover provider does not support payment source ${source}`,
});

@Injectable()
export class CloverPaymentProviderAdapter
  implements PaymentProvider, PaymentTerminalProvider
{
  constructor(
    private readonly ecommerce: CloverEcommerceTransport,
    private readonly terminal: CloverTerminalTransport,
    private readonly platform: CloverPlatformPaymentsGateway,
  ) {}

  async getAvailability(): Promise<PaymentTerminalAvailability> {
    if (!this.platform.isConfigured()) {
      return {
        state: 'MISCONFIGURED',
        configured: false,
        available: false,
        failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
        failureMessage:
          'Clover Platform canonical payment read requires merchant id and Platform v3 access token',
      };
    }
    return this.terminal.getAvailability();
  }

  async startPayment(
    request: StartPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (!this.platform.isConfigured()) {
        return {
          status: 'FAILED',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          externalPaymentId: request.externalPaymentId,
          amountCents: request.amountCents,
          currency: request.currency,
          failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
          failureMessage:
            'Terminal sale was not sent because Platform v3 canonical payment read is not configured',
        };
      }
      const execution = await this.terminal.startPayment(request);
      if (!this.shouldCanonicalizeTerminalExecution(execution)) {
        return execution;
      }
      const canonical = await this.platform.getCanonicalPayment({
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        externalPaymentId:
          execution.externalPaymentId ?? request.externalPaymentId,
        providerPaymentId: execution.providerPaymentId,
        amountCents: request.amountCents,
        currency: request.currency,
      });
      return this.mergeTerminalObservation(execution, canonical);
    }

    if (request.source !== 'WEB_ECOMMERCE') {
      return unsupportedSource(request.source);
    }

    const paymentInstrumentToken = request.paymentInstrumentToken?.trim();
    if (!paymentInstrumentToken) {
      return {
        status: 'FAILED',
        externalPaymentId: request.externalPaymentId,
        failureCode: 'CLOVER_PAYMENT_INSTRUMENT_REQUIRED',
        failureMessage: 'Clover Ecommerce requires a payment instrument token',
      };
    }

    const result = await this.ecommerce.createCardPayment({
      amountCents: request.amountCents,
      currency: request.currency,
      source: paymentInstrumentToken,
      orderId: request.paymentId,
      externalPaymentId: request.externalPaymentId ?? undefined,
      idempotencyKey: request.idempotencyKey,
      description: request.description ?? undefined,
    });

    return toProviderOutcomeFromCreate(result, request.externalPaymentId);
  }

  async getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (request.amountCents === undefined || !request.currency) {
        return {
          status: 'UNKNOWN',
          evidence: 'CANONICAL',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          externalPaymentId: request.externalPaymentId,
          providerPaymentId: request.providerPaymentId,
          failureCode: 'CLOVER_PLATFORM_EXPECTED_PAYMENT_FACTS_MISSING',
          failureMessage:
            'Canonical Clover reconciliation requires expected amount and currency',
        };
      }
      return this.platform.getCanonicalPayment({
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        externalPaymentId: request.externalPaymentId,
        providerPaymentId: request.providerPaymentId,
        amountCents: request.amountCents,
        currency: request.currency,
      });
    }
    if (request.source !== 'WEB_ECOMMERCE') {
      return unsupportedSource(request.source);
    }

    const result = await this.ecommerce.getChargeStatus({
      paymentId: request.providerPaymentId ?? undefined,
      externalPaymentId: request.externalPaymentId ?? undefined,
      idempotencyKey: request.idempotencyKey,
    });
    return toProviderOutcomeFromStatus(result);
  }

  cancelPayment(
    request: CancelPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.cancelPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_CANCEL_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce cancel is not implemented',
    });
  }

  voidPayment(request: VoidPaymentRequest): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.voidPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_VOID_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce void is deferred to Payment Phase E',
    });
  }

  refundPayment(
    request: RefundPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.refundPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_REFUND_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce refund is deferred to Payment Phase E',
    });
  }

  private shouldCanonicalizeTerminalExecution(
    outcome: PaymentProviderOutcome,
  ): boolean {
    return (
      outcome.status === 'SUCCEEDED' ||
      outcome.status === 'PROCESSING' ||
      outcome.status === 'UNKNOWN' ||
      Boolean(outcome.providerPaymentId)
    );
  }

  private mergeTerminalObservation(
    execution: PaymentProviderOutcome,
    canonical: PaymentProviderOutcome,
  ): PaymentProviderOutcome {
    return {
      ...canonical,
      externalPaymentId:
        canonical.externalPaymentId ?? execution.externalPaymentId,
      providerPaymentId:
        canonical.providerPaymentId ?? execution.providerPaymentId,
      providerOrderId: canonical.providerOrderId ?? execution.providerOrderId,
      terminalId: canonical.terminalId ?? execution.terminalId,
      cardBrand: canonical.cardBrand ?? execution.cardBrand,
      cardLast4: canonical.cardLast4 ?? execution.cardLast4,
      resultCode: canonical.resultCode ?? execution.resultCode,
    };
  }
}
