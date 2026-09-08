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
    if (!(await this.platform.isConfigured())) {
      return {
        state: 'MISCONFIGURED',
        configured: false,
        available: false,
        failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
        failureMessage:
          'Clover Platform canonical payment read requires an active merchant OAuth authorization',
      };
    }
    return this.terminal.getAvailability();
  }

  async startPayment(
    request: StartPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (!(await this.platform.isConfigured())) {
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
          providerRefundId: request.providerRefundId,
          failureCode: 'CLOVER_PLATFORM_EXPECTED_PAYMENT_FACTS_MISSING',
          failureMessage:
            'Canonical Clover reconciliation requires expected amount and currency',
        };
      }
      if (request.operation === 'REFUND' || request.operation === 'VOID') {
        if (
          request.expectedAdditionalChargeRefundCents === undefined ||
          request.expectedAdditionalChargeRefundCents < 0
        ) {
          return {
            status: 'UNKNOWN',
            evidence: 'CANONICAL',
            paymentId: request.paymentId,
            attemptId: request.attemptId,
            idempotencyKey: request.idempotencyKey,
            providerPaymentId: request.providerPaymentId,
            providerRefundId: request.providerRefundId,
            amountCents: request.amountCents,
            currency: request.currency,
            failureCode:
              'CLOVER_PLATFORM_EXPECTED_REVERSAL_CHARGE_FACTS_MISSING',
            failureMessage:
              'Canonical Clover reversal reconciliation requires expected additional-charge refund facts',
          };
        }
        return this.platform.getCanonicalReversal({
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          providerPaymentId: request.providerPaymentId,
          providerRefundId: request.providerRefundId,
          amountCents: request.amountCents,
          currency: request.currency,
          operation: request.operation,
          expectedAdditionalChargeRefundCents:
            request.expectedAdditionalChargeRefundCents,
        });
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

  async voidPayment(
    request: VoidPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (!(await this.platform.isConfigured())) {
        return {
          status: 'FAILED',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          providerPaymentId: request.providerPaymentId,
          failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
          failureMessage:
            'Terminal void was not sent because Platform v3 canonical reversal read is not configured',
        };
      }
      const execution = await this.terminal.voidPayment(request);
      if (
        execution.status === 'FAILED' ||
        execution.status === 'CANCELLED' ||
        request.amountCents === undefined ||
        !request.currency ||
        request.expectedAdditionalChargeRefundCents === undefined
      ) {
        return execution;
      }
      const canonical = await this.platform.getCanonicalReversal({
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        providerPaymentId:
          execution.providerPaymentId ?? request.providerPaymentId,
        providerRefundId: execution.providerRefundId,
        amountCents: request.amountCents,
        currency: request.currency,
        operation: 'VOID',
        expectedAdditionalChargeRefundCents:
          request.expectedAdditionalChargeRefundCents,
      });
      return this.mergeTerminalObservation(execution, canonical);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_VOID_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce void remains on the legacy Web flow',
    });
  }

  async refundPayment(
    request: RefundPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      if (!(await this.platform.isConfigured())) {
        return {
          status: 'FAILED',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          providerPaymentId: request.providerPaymentId,
          failureCode: 'CLOVER_PLATFORM_MISCONFIGURED',
          failureMessage:
            'Terminal refund was not sent because Platform v3 canonical reversal read is not configured',
        };
      }
      if (
        !request.currency ||
        request.expectedAdditionalChargeRefundCents === undefined
      ) {
        return {
          status: 'FAILED',
          paymentId: request.paymentId,
          attemptId: request.attemptId,
          idempotencyKey: request.idempotencyKey,
          providerPaymentId: request.providerPaymentId,
          failureCode: 'CLOVER_REFUND_EXPECTED_FACTS_MISSING',
          failureMessage:
            'Terminal refund requires original currency and additional-charge facts',
        };
      }
      const execution = await this.terminal.refundPayment(request);
      if (execution.status === 'FAILED' || execution.status === 'CANCELLED') {
        return execution;
      }
      const canonical = await this.platform.getCanonicalReversal({
        paymentId: request.paymentId,
        attemptId: request.attemptId,
        idempotencyKey: request.idempotencyKey,
        providerPaymentId:
          execution.providerPaymentId ?? request.providerPaymentId,
        providerRefundId: execution.providerRefundId,
        amountCents: request.amountCents,
        currency: request.currency,
        operation: 'REFUND',
        expectedAdditionalChargeRefundCents:
          request.expectedAdditionalChargeRefundCents,
      });
      return this.mergeTerminalObservation(execution, canonical);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_REFUND_NOT_IMPLEMENTED',
      failureMessage: 'Clover Ecommerce refund remains on the legacy Web flow',
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
      providerRefundId:
        canonical.providerRefundId ?? execution.providerRefundId,
      providerOrderId: canonical.providerOrderId ?? execution.providerOrderId,
      terminalId: canonical.terminalId ?? execution.terminalId,
      cardBrand: canonical.cardBrand ?? execution.cardBrand,
      cardLast4: canonical.cardLast4 ?? execution.cardLast4,
      resultCode: canonical.resultCode ?? execution.resultCode,
    };
  }
}
