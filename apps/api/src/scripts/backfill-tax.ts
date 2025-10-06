// apps/api/src/scripts/backfill-tax.ts
import { PrismaClient, Order } from '@prisma/client';

const prisma = new PrismaClient();

// 从环境变量读税率，默认 13%
const SALES_TAX_RATE: number = Number(process.env.SALES_TAX_RATE ?? 0.13);

function calcTax(subtotalCents: number): { taxCents: number; totalCents: number } {
  const taxCents = Math.round(subtotalCents * SALES_TAX_RATE);
  return { taxCents, totalCents: subtotalCents + taxCents };
}

async function fetchOrdersToFix(): Promise<
  Array<Pick<Order, 'id' | 'subtotalCents' | 'taxCents' | 'totalCents'>>
> {
  // 筛选：目前仅修复 taxCents = 0 且小计 > 0 的订单
  return prisma.order.findMany({
    select: { id: true, subtotalCents: true, taxCents: true, totalCents: true },
    where: { AND: [{ subtotalCents: { gt: 0 } }, { taxCents: 0 }] },
    orderBy: { createdAt: 'asc' },
    take: 1000, // 安全上限，防止一次性过大
  });
}

async function backfill(): Promise<number> {
  const toFix = await fetchOrdersToFix();
  if (toFix.length === 0) return 0;

  const ops = toFix.map((o) => {
    const { taxCents, totalCents } = calcTax(o.subtotalCents);
    return prisma.order.update({
      where: { id: o.id },
      data: { taxCents, totalCents },
    });
  });

  // 事务批量更新
  await prisma.$transaction(ops);
  return toFix.length;
}

async function main(): Promise<void> {
  try {
    const updated = await backfill();
    // eslint-disable-next-line no-console
    console.log(`Backfill done. Updated ${updated} order(s).`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Backfill failed:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
