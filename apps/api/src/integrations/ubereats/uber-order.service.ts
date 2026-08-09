import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { UberEatsService } from './ubereats.service';

/** Order ingestion and outbound action boundary. */
@Injectable()
export class UberOrderService {
  constructor(private readonly facade: UberEatsService) {}

  syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    return this.facade.syncOrderStatusToUber(externalOrderId, status);
  }
  getReadyForPickupAction(externalOrderId: string) {
    return this.facade.getReadyForPickupAction(externalOrderId);
  }
  retryReadyForPickup(externalOrderId: string) {
    return this.facade.retryReadyForPickup(externalOrderId);
  }
  processPendingUberOrderActions(limit = 50) {
    return this.facade.processPendingUberOrderActions(limit);
  }
  acceptUberOrder(externalOrderId: string) {
    return this.facade.acceptUberOrder(externalOrderId);
  }
  denyUberOrder(...args: Parameters<UberEatsService['denyUberOrder']>) {
    return this.facade.denyUberOrder(...args);
  }
  listPendingUberOrders() {
    return this.facade.listPendingUberOrders();
  }
}
