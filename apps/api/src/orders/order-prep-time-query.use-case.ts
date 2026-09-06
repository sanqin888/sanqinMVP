import { Injectable } from '@nestjs/common';
import { PrismaService } from './orders-prisma';

@Injectable()
export class OrderPrepTimeQueryUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async getAveragePrepTimeMinutes(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentOrders = await this.prisma.order.findMany({
      where: {
        status: { in: ['ready', 'completed'] },
        readyAt: { gte: oneHourAgo },
        makingAt: { not: null },
      },
      select: {
        makingAt: true,
        readyAt: true,
      },
    });

    if (recentOrders.length === 0) return 15;

    const totalMinutes = recentOrders.reduce((acc, order) => {
      const makingAt = order.makingAt;
      const readyAt = order.readyAt;
      if (!makingAt || !readyAt) return acc;
      const diffMs = readyAt.getTime() - makingAt.getTime();
      return acc + diffMs / 60000;
    }, 0);

    const avg = Math.round(totalMinutes / recentOrders.length);
    return Math.max(avg, 5);
  }
}
