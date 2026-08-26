import { Injectable } from '@nestjs/common';

import type {
  CancelPaymentRequest,
  GetPaymentStatusRequest,
  RefundPaymentRequest,
  StartPaymentRequest,
  VoidPaymentRequest,
} from '../../../application/payment-provider.port';
import type { PaymentProviderOutcome } from '../../../domain/payment.types';
import { CloverProviderConfig } from '../clover-provider.config';

const terminalNotEnabled = (): PaymentProviderOutcome => ({
  status: 'FAILED',
  failureCode: 'CLOVER_TERMINAL_NOT_ENABLED',
  failureMessage: 'Clover Terminal transport is not enabled in Phase B',
});

@Injectable()
export class CloverTerminalTransport {
  constructor(private readonly config: CloverProviderConfig) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.accessToken &&
        this.config.merchantId &&
        this.config.terminalDeviceId,
    );
  }

  isEnabled(): boolean {
    return false;
  }

  startPayment(request: StartPaymentRequest): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve(terminalNotEnabled());
  }

  getPaymentStatus(
    request: GetPaymentStatusRequest,
  ): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve(terminalNotEnabled());
  }

  cancelPayment(request: CancelPaymentRequest): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve(terminalNotEnabled());
  }

  voidPayment(request: VoidPaymentRequest): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve(terminalNotEnabled());
  }

  refundPayment(request: RefundPaymentRequest): Promise<PaymentProviderOutcome> {
    void request;
    return Promise.resolve(terminalNotEnabled());
  }
}
