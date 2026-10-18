import { TerminalPaymentService } from './create-payment-attempt.use-case';
import { SandboxTerminalManualRecoveryService } from './sandbox-terminal-manual-recovery.service';

/** Narrow Payments public capability for the cross-owner exception workflow. */
export class PaymentExceptionPaymentGuardService {
  constructor(
    private readonly sandbox: SandboxTerminalManualRecoveryService,
    private readonly terminalPayments: TerminalPaymentService,
  ) {}

  isIsolatedSandbox(): boolean {
    return this.sandbox.isIsolatedSandbox();
  }

  finishConfirmedFailureTerminal(attemptId: string): Promise<boolean> {
    return this.terminalPayments.finishTerminalOperation(attemptId);
  }
}
