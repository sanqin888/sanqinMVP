import { Injectable } from '@nestjs/common';

import type {
  CancelPaymentRequest,
  GetPaymentStatusRequest,
  PaymentProvider,
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
import { CloverTerminalTransport } from './terminal/clover-terminal.transport';

const unsupportedSource = (source: string): PaymentProviderOutcome => ({
  status: 'FAILED',
  failureCode: 'CLOVER_UNSUPPORTED_PAYMENT_SOURCE',
  failureMessage: `Clover provider does not support payment source ${source}`,
});

@Injectable()
export class CloverPaymentProviderAdapter implements PaymentProvider {
  constructor(
    private readonly ecommerce: CloverEcommerceTransport,
    private readonly terminal: CloverTerminalTransport,
  ) {}

  async startPayment(
    request: StartPaymentRequest,
  ): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.startPayment(request);
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
      return this.terminal.getPaymentStatus(request);
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
      failureMessage: 'Clover cancel is not implemented in Phase B',
    });
  }

  voidPayment(request: VoidPaymentRequest): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.voidPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_VOID_NOT_IMPLEMENTED',
      failureMessage: 'Clover void is not implemented in Phase B',
    });
  }

  refundPayment(request: RefundPaymentRequest): Promise<PaymentProviderOutcome> {
    if (request.source === 'POS_TERMINAL') {
      return this.terminal.refundPayment(request);
    }
    return Promise.resolve({
      status: 'FAILED',
      failureCode: 'CLOVER_REFUND_NOT_IMPLEMENTED',
      failureMessage: 'Clover refund is not implemented in Phase B',
    });
  }
}
