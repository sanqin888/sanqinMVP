import { Injectable } from '@nestjs/common';
import { OrderStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UBER_ACTION_BY_LOCAL_STATUS } from '../../domain/orders/uber-order.types';

/** Centralizes local-to-Uber status mapping and sync audit records. */
@Injectable()
export class UberOrderStatusSyncService {
  constructor(private readonly prisma: PrismaService) {}
  actionFor(status: OrderStatus) {
    return UBER_ACTION_BY_LOCAL_STATUS[status];
  }
  clientRequestId(externalOrderId: string) {
    return `ubereats:${externalOrderId}`;
  }
  async audit(eventName: string, payload: Prisma.JsonObject) {
    await this.prisma.opsEvent.create({
      data: { eventName, source: 'ubereats', payload },
    });
  }
}
