import { Inject, Injectable } from '@nestjs/common';
import type {
  UberOrderActionGatewayPort,
  UberOrderDenial,
} from '../../application/orders/uber-order.ports';
import { UberOrderGateway } from './uber-resource.gateways';

export class UberOrderCommandError extends Error {
  constructor(
    readonly status: number,
    message = `Uber order command failed with HTTP ${status}`,
  ) {
    super(message);
    this.name = 'UberOrderCommandError';
  }
}

/** Owns Uber endpoints, wire payloads and HTTP outcome semantics. */
@Injectable()
export class UberOrderActionGatewayAdapter implements UberOrderActionGatewayPort {
  constructor(
    @Inject(UberOrderGateway)
    private readonly gateway: Pick<UberOrderGateway, 'executeAction'>,
  ) {}

  accept(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'ACCEPT', {});
  }
  deny(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial: UberOrderDenial;
  }) {
    return this.execute(input, 'DENY', {
      reason: {
        code: this.reasonCode(input.denial.reasonCode),
        explanation:
          input.denial.reasonDetail?.trim() || input.denial.reasonCode.trim(),
      },
    });
  }
  cancel(input: {
    externalOrderId: string;
    idempotencyKey: string;
    denial?: UberOrderDenial;
  }) {
    // CANCEL remains a business action everywhere else. This adapter alone
    // translates it to Uber's merchant-denial endpoint and wire payload.
    return this.execute(input, 'DENY', {
      reason: {
        code: this.reasonCode(input.denial?.reasonCode ?? 'OTHER'),
        explanation:
          input.denial?.reasonDetail?.trim() || 'Cancelled by merchant',
      },
    });
  }
  readyForPickup(input: { externalOrderId: string; idempotencyKey: string }) {
    return this.execute(input, 'READY_FOR_PICKUP', {});
  }

  private async execute(
    input: { externalOrderId: string; idempotencyKey: string },
    action: 'ACCEPT' | 'DENY' | 'READY_FOR_PICKUP',
    payload: Record<string, unknown>,
  ): Promise<void> {
    const outcome = await this.gateway.executeAction(
      input.externalOrderId,
      action,
      payload,
      input.idempotencyKey,
    );
    if (outcome.ok || (action === 'READY_FOR_PICKUP' && outcome.status === 409))
      return;
    throw new UberOrderCommandError(outcome.status);
  }

  private reasonCode(value: string): string {
    const code = value.trim().toUpperCase();
    if (code === 'ITEM_UNAVAILABLE') return 'ITEM_AVAILABILITY';
    return [
      'STORE_CLOSED',
      'POS_NOT_READY',
      'POS_OFFLINE',
      'ITEM_AVAILABILITY',
      'MISSING_ITEM',
      'MISSING_INFO',
      'PRICING',
      'CAPACITY',
      'ADDRESS',
      'SPECIAL_INSTRUCTIONS',
    ].includes(code)
      ? code
      : 'OTHER';
  }
}
