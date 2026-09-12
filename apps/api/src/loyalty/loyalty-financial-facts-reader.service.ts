import { Injectable } from '@nestjs/common';
import { LoyaltyEntryType, LoyaltyTarget, type Prisma } from '@prisma/client';

import type {
  LoyaltyFinancialFactKindV1,
  LoyaltyFinancialFactV1,
  LoyaltyFinancialFactsRangeV1,
  LoyaltyFinancialFactsReaderPort,
} from './loyalty-financial-facts-reader.contract';
import { PrismaService } from './loyalty-prisma';

const MICRO_PER_CENT = 10_000n;
const STORE_BALANCE_FINANCIAL_TYPES: LoyaltyEntryType[] = [
  LoyaltyEntryType.TOPUP_PURCHASED,
  LoyaltyEntryType.REDEEM_ON_ORDER,
  LoyaltyEntryType.REFUND_RETURN_REDEEM,
];

const LOYALTY_FINANCIAL_SELECT = {
  ledgerStableId: true,
  type: true,
  target: true,
  deltaMicro: true,
  createdAt: true,
  orderStableId: true,
  sourceKey: true,
} satisfies Prisma.LoyaltyLedgerSelect;

type LoyaltyFinancialRow = Prisma.LoyaltyLedgerGetPayload<{
  select: typeof LOYALTY_FINANCIAL_SELECT;
}>;

const toCentAlignedAmount = (deltaMicro: bigint): number => {
  const absoluteMicro = deltaMicro < 0n ? -deltaMicro : deltaMicro;
  if (absoluteMicro % MICRO_PER_CENT !== 0n) {
    throw new Error(
      'Store Balance financial fact is not aligned to whole cents',
    );
  }
  const amountCents = Number(absoluteMicro / MICRO_PER_CENT);
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error('Store Balance financial fact exceeds safe integer cents');
  }
  return amountCents;
};

const toKind = (row: LoyaltyFinancialRow): LoyaltyFinancialFactKindV1 => {
  if (row.target !== LoyaltyTarget.BALANCE) {
    throw new Error('Loyalty financial fact must target Store Balance');
  }

  switch (row.type) {
    case LoyaltyEntryType.TOPUP_PURCHASED:
      if (row.deltaMicro <= 0n) {
        throw new Error(
          'Store Balance top-up must increase liability principal',
        );
      }
      return 'STORE_BALANCE_TOPUP';
    case LoyaltyEntryType.REDEEM_ON_ORDER:
      if (row.deltaMicro >= 0n) {
        throw new Error(
          'Store Balance redemption must decrease liability principal',
        );
      }
      return 'STORE_BALANCE_REDEEMED';
    case LoyaltyEntryType.REFUND_RETURN_REDEEM:
      if (row.deltaMicro <= 0n) {
        throw new Error(
          'Store Balance return must increase liability principal',
        );
      }
      return 'STORE_BALANCE_RETURNED';
    default:
      throw new Error(
        `Unsupported Store Balance financial fact type: ${row.type}`,
      );
  }
};

@Injectable()
export class LoyaltyFinancialFactsReaderService implements LoyaltyFinancialFactsReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async readFactsByOrderStableId(
    orderStableId: string,
  ): Promise<LoyaltyFinancialFactV1[]> {
    const stableId = orderStableId.trim();
    if (!stableId) return [];

    const rows = await this.prisma.loyaltyLedger.findMany({
      where: {
        orderStableId: stableId,
        target: LoyaltyTarget.BALANCE,
        type: { in: STORE_BALANCE_FINANCIAL_TYPES },
      },
      select: LOYALTY_FINANCIAL_SELECT,
      orderBy: [{ createdAt: 'asc' }, { ledgerStableId: 'asc' }],
    });

    return rows.map((row) => this.toFact(row));
  }

  async readFactsForRange(
    range: LoyaltyFinancialFactsRangeV1,
  ): Promise<LoyaltyFinancialFactV1[]> {
    if (range.toExclusive <= range.fromInclusive) {
      throw new Error('toExclusive must be after fromInclusive');
    }

    const rows = await this.prisma.loyaltyLedger.findMany({
      where: {
        createdAt: {
          gte: range.fromInclusive,
          lt: range.toExclusive,
        },
        target: LoyaltyTarget.BALANCE,
        type: { in: STORE_BALANCE_FINANCIAL_TYPES },
      },
      select: LOYALTY_FINANCIAL_SELECT,
      orderBy: [{ createdAt: 'asc' }, { ledgerStableId: 'asc' }],
    });

    return rows.map((row) => this.toFact(row));
  }

  private toFact(row: LoyaltyFinancialRow): LoyaltyFinancialFactV1 {
    return {
      version: 1,
      factStableId: row.ledgerStableId,
      kind: toKind(row),
      occurredAt: row.createdAt,
      orderStableId: row.orderStableId,
      sourceKey: row.sourceKey,
      currency: 'CAD',
      amountCents: toCentAlignedAmount(row.deltaMicro),
    };
  }
}
