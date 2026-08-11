import { Injectable } from '@nestjs/common';
import { UberMenuPublishStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  MenuNotificationRepository,
  UberMenuNotification,
} from '../../application/menu/uber-menu-notification.handler';

/** Persistence dedicated to immutable menu-publication correlation. */
@Injectable()
export class UberMenuNotificationPrismaRepository implements MenuNotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCorrelation(input: {
    publishVersion: string | null;
    resourceId: string | null;
  }) {
    const correlations: Prisma.UberMenuPublishVersionWhereInput[] = [];
    if (input.publishVersion)
      correlations.push({ versionStableId: input.publishVersion });
    if (input.resourceId)
      correlations.push({
        responsePayload: {
          path: ['resource_id'],
          equals: input.resourceId,
        },
      });
    if (!correlations.length) return null;
    return this.prisma.uberMenuPublishVersion.findFirst({
      where: { OR: correlations },
      select: { id: true },
    });
  }

  async apply(id: string, event: UberMenuNotification): Promise<void> {
    if (event.status !== 'SUCCEEDED' && event.status !== 'FAILED') return;
    await this.prisma.uberMenuPublishVersion.updateMany({
      where: { id, status: UberMenuPublishStatus.SUBMITTED },
      data: {
        status: event.status,
        finishedAt: new Date(),
        errorMessage: event.status === 'FAILED' ? 'Uber 菜单处理失败' : null,
        errorDetails:
          event.status === 'FAILED' && Array.isArray(event.failures)
            ? (event.failures as Prisma.InputJsonValue)
            : undefined,
      },
    });
  }
}
