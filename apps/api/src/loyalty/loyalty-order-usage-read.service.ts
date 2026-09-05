import { Injectable } from '@nestjs/common';
import { PrismaService } from './loyalty-prisma';
import type {
  LoyaltyOrderUsageReaderPort,
  LoyaltyOrderUsageReadResult,
} from './loyalty-order-usage-read.contract';

const MICRO_PER_POINT = 1_000_000;
const MICRO_PER_CENT = 10_000;

@Injectable()
export class LoyaltyOrderUsageReadService implements LoyaltyOrderUsageReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderUsage(input: {
    orderStableId: string;
  }): Promise<LoyaltyOrderUsageReadResult> {
    const orderStableId = input.orderStableId.trim();
    if (!orderStableId) {
      return { balancePaidCents: 0, pointsEarned: 0 };
    }

    const ledgers = await this.prisma.loyaltyLedger.findMany({
      where: {
        orderStableId,
        OR: [
          { target: 'BALANCE', type: 'REDEEM_ON_ORDER' },
          {
            target: 'POINTS',
            type: { in: ['EARN_ON_PURCHASE', 'AMEND_EARN_ADJUST'] },
          },
        ],
      },
      select: { target: true, deltaMicro: true },
    });

    const balanceMicroUsed = ledgers
      .filter((entry) => entry.target === 'BALANCE' && entry.deltaMicro < 0n)
      .reduce((sum, entry) => sum + -entry.deltaMicro, 0n);
    const pointsEarnedMicro = ledgers
      .filter((entry) => entry.target === 'POINTS')
      .reduce((sum, entry) => sum + entry.deltaMicro, 0n);

    return {
      balancePaidCents: Number(balanceMicroUsed) / MICRO_PER_CENT,
      pointsEarned: Number(pointsEarnedMicro) / MICRO_PER_POINT,
    };
  }
}
