import { ConflictException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { PosCreateFullRefundInput } from '../pos/pos-orders.service';
import { PosOrdersService } from '../pos/pos-orders.service';
import { PosCardRefundOrchestrationService } from './pos-card-refund-orchestration.service';

export type PosFullRefundResult = Awaited<
  ReturnType<PosOrdersService['createFullRefund']>
> & {
  managedPaymentStatus?: string;
  managedPaymentOperation?: 'REFUND' | 'VOID';
};

@Injectable()
export class PosFullRefundOrchestrationService {
  constructor(
    private readonly cardRefunds: PosCardRefundOrchestrationService,
    private readonly posOrders: PosOrdersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async refundFullOrder(
    storeStableId: string,
    orderStableId: string,
    input: PosCreateFullRefundInput,
  ): Promise<PosFullRefundResult> {
    const managed = await this.cardRefunds.refundFullOrder(
      storeStableId,
      orderStableId,
      input,
    );

    if (managed.mode === 'LEGACY_MANUAL_REQUIRED') {
      const result = await this.posOrders.createFullRefund(
        storeStableId,
        orderStableId,
        input,
      );
      if (result.outcome === 'refunded') {
        await this.emitCancellationPrint(orderStableId, input);
      }
      return result;
    }

    if (managed.status === 'SUCCEEDED') {
      const result: PosFullRefundResult = {
        order: managed.order,
        outcome: 'refunded',
        managedPaymentStatus: managed.status,
        managedPaymentOperation: managed.operation ?? undefined,
      };
      await this.emitCancellationPrint(orderStableId, input);
      return result;
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

  private async emitCancellationPrint(
    orderStableId: string,
    input: PosCreateFullRefundInput,
  ): Promise<void> {
    await this.eventEmitter.emitAsync('order.cancellation.print', {
      orderStableId,
      locale: 'zh',
      reason: input.reason,
      operatorName: input.operatorName,
    });
  }
}
