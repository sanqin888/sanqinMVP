import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UberOrderStatusAuditPort } from '../../application/orders/uber-order-processing.ports';
import type { UberJsonValue } from '../../application/shared/uber-json-value';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class UberOrderStatusAuditPrismaAdapter implements UberOrderStatusAuditPort {
  constructor(private readonly prisma: PrismaService) {}
  async record(eventName: string, payload: UberJsonValue): Promise<void> {
    await this.prisma.opsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      },
    });
  }
}
