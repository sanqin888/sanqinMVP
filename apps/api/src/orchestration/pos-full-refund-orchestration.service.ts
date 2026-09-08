import { ConflictException, Inject, Injectable } from '@nestjs/common';

import {
  POS_FULL_REFUND_MANAGEMENT,
  type PosFullRefundManagementInput,
  type PosFullRefundManagementPort,
  type PosFullRefundManagementResult,
} from '../pos/public-api';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';

export type PosFullRefundResult = PosFullRefundManagementResult & {
  managedPaymentStatus?: string;
  managedPaymentOperation?: 'REFUND' | 'VOID';
};

@Injectable()
export class PosFullRefundOrchestrationService {
  constructor(
    private readonly cardRefunds: PosCardRefundOrchestrationService,
    @Inject(POS_FULL_REFUND_MANAGEMENT)
    private readonly fullRefundManagement: PosFullRefundManagementPort,
  ) {}

  async refundFullOrder(
    storeStableId: string,
    orderStableId: string,
    input: PosFullRefundManagementInput,
  ): Promise<PosFullRefundResult> {
    const managed = await this.cardRefunds.refundFullOrder(
      storeStableId,
      orderStableId,
      input,
    );

    if (managed.mode === 'LEGACY_MANUAL_REQUIRED') {
      return this.fullRefundManagement.createFullRefund(
        storeStableId,
        orderStableId,
        input,
      );
    }

    if (managed.status === 'SUCCEEDED') {
      return {
        order: managed.order,
        outcome: 'refunded',
        managedPaymentStatus: managed.status,
        managedPaymentOperation: managed.operation ?? undefined,
      };
    }

    if (
      managed.status === 'PROCESSING' ||
      managed.status === 'UNKNOWN' ||
      managed.status === 'RECONCILING'
    ) {
      return {
        order: managed.order,
        outcome: 'pending_platform',
        managedPaymentStatus: managed.status,
        managedPaymentOperation: managed.operation ?? undefined,
      };
    }

    throw new ConflictException({
      code: managed.failureCode ?? 'POS_MANAGED_CARD_REFUND_FAILED',
      message:
        managed.failureMessage ??
        'Clover did not confirm the managed card refund. The order was not marked refunded.',
      paymentStatus: managed.status,
      paymentOperation: managed.operation,
    });
  }
}
