import { CloverWebCheckoutOrchestrationModule } from './clover-web-checkout-orchestration.module';
import { PosCardPaymentOrchestrationModule } from './pos-card-payment-orchestration.module';

describe('Orders public composition module loading', () => {
  it('loads both payment orchestration modules without eager barrel initialization failure', () => {
    expect(CloverWebCheckoutOrchestrationModule).toBeDefined();
    expect(PosCardPaymentOrchestrationModule).toBeDefined();
  });
});
