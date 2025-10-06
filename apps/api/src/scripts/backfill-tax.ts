/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TAX_RATE = Number(process.env.SALES_TAX_RATE ?? 0.13);

async function main(): Promise<void> {
  const orders = await prisma.order.findMany({
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

    updated += 1;
  }

  console.log(`Backfilled ${updated} orders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
