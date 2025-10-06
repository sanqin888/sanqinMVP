/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? 0.13);

async function main() {
  const rateRaw = process.env.SALES_TAX_RATE ?? 0.13;
  const rateNumber = Number(String(rateRaw).replace('%', ''));
  const rate = Number.isFinite(rateNumber)
    ? rateNumber > 1
      ? rateNumber / 100
      : rateNumber
    : 0.13;
  const targets = await prisma.order.findMany({
    where: { taxCents: 0 },
    select: { id: true, subtotalCents: true },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;

  for (const o of orders) {
    const taxCents = Math.round(o.subtotalCents * TAX_RATE);
    const totalCents = o.subtotalCents + taxCents;

    await prisma.order.update({
      where: { id: o.id },
      data: { taxCents, totalCents },
    });
    updated++;
    if (updated % 50 === 0)
      console.log(`Updated ${updated}/${targets.length}...`);
  }

  console.log(`Backfilled ${updated} orders.`);
}

void (async () => {
  try {
    await main();
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
