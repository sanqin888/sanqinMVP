import type { PaymentTransaction } from '../domain/payment-transaction';
import type { PaymentProviderName } from '../domain/payment.types';

export class PaymentProviderTransactionIdentityConflictError extends Error {
  constructor(provider: PaymentProviderName, providerPaymentId: string) {
    super(
      `More than one ${provider} SALE transaction maps to provider payment ${providerPaymentId}`,
    );
    this.name = 'PaymentProviderTransactionIdentityConflictError';
  }
}

export interface PaymentProviderTransactionLookup {
  findSaleByProviderPaymentId(
    provider: PaymentProviderName,
    providerPaymentId: string,
  ): Promise<PaymentTransaction | null>;
}

export const PAYMENT_PROVIDER_TRANSACTION_LOOKUP = Symbol(
  'PAYMENT_PROVIDER_TRANSACTION_LOOKUP',
);
