import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  UberGatewayAuditEvent,
  UberGatewayAuditPort,
} from '../../application/shared/uber-gateway-audit.port';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class UberGatewayAuditPrismaAdapter implements UberGatewayAuditPort {
  constructor(private readonly prisma: PrismaService) {}

  async recordResponse(event: UberGatewayAuditEvent): Promise<void> {
    await this.prisma.opsEvent.create({
      data: {
        eventName: 'uber.gateway.response-audited',
        source: 'ubereats',
        payload: {
          ...event,
          recordedAt: event.recordedAt.toISOString(),
        } as Prisma.JsonObject,
      },
    });
  }
}
