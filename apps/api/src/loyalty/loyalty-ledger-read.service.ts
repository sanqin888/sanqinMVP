import { Injectable } from '@nestjs/common';
import { PrismaService } from './loyalty-prisma';
import type {
  LoyaltyLedgerReaderPort,
  LoyaltyLedgerReadResult,
} from './loyalty-ledger-read.contract';
import { LoyaltyService } from './loyalty.service';

const MICRO_PER_POINT = 1_000_000;

@Injectable()
export class LoyaltyLedgerReadService implements LoyaltyLedgerReaderPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async getLoyaltyLedger(input: {
    userStableId: string;
    limit: number;
    target?: 'POINTS' | 'BALANCE';
  }): Promise<LoyaltyLedgerReadResult> {
    const userId = await this.loyalty.resolveUserIdByStableId(input.userStableId);
    const account = await this.loyalty.ensureAccount(userId);

    const entries = await this.prisma.loyaltyLedger.findMany({
      where: {
        accountId: account.id,
        ...(input.target ? { target: input.target } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      select: {
        ledgerStableId: true,
        createdAt: true,
        type: true,
        target: true,
        orderStableId: true,
        deltaMicro: true,
        balanceAfterMicro: true,
        note: true,
      },
    });

    return {
      entries: entries.map((entry) => ({
        ledgerStableId: entry.ledgerStableId,
        createdAt: entry.createdAt.toISOString(),
        type: entry.type,
        target: entry.target,
        deltaPoints: Number(entry.deltaMicro) / MICRO_PER_POINT,
        balanceAfterPoints: Number(entry.balanceAfterMicro) / MICRO_PER_POINT,
        note: entry.note ?? undefined,
        ...(entry.orderStableId ? { orderStableId: entry.orderStableId } : {}),
      })),
    };
  }
}
