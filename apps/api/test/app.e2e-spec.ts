import { randomUUID } from 'node:crypto';
import request, { SuperTest, Test } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type StoredOrderItem = {
  id: string;
  orderId: string;
  productId: string;
  qty: number;
  unitPriceCents: number | null;
  optionsJson: Prisma.JsonValue | null;
};

type StoredOrder = {
  id: string;
  status: OrderStatus;
  channel: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  fulfillmentType: string;
  pickupCode: string | null;
  createdAt: Date;
  items: StoredOrderItem[];
};

class InMemoryPrismaService implements Partial<PrismaService> {
  private orders: StoredOrder[] = [];

  readonly order = {
    create: (args: Prisma.OrderCreateArgs) =>
      Promise.resolve(this.createOrder(args)),
    findMany: (args?: Prisma.OrderFindManyArgs) =>
      Promise.resolve(this.findMany(args)),
    findUnique: (args: Prisma.OrderFindUniqueArgs) =>
      Promise.resolve(this.findUnique(args)),
    update: (args: Prisma.OrderUpdateArgs) =>
      Promise.resolve(this.updateOrder(args)),
  } as unknown as PrismaService['order'];

  async onModuleInit(): Promise<void> {
    // no-op for tests
  }

  async onModuleDestroy(): Promise<void> {
    // no-op for tests
  }

  enableShutdownHooks(): void {
    // no-op for tests
  }

  reset(): void {
    this.orders = [];
  }

  private createOrder(args: Prisma.OrderCreateArgs) {
    const data = args.data as Prisma.OrderCreateInput;
    const orderId =
      data.id && typeof data.id === 'string' ? data.id : randomUUID();
    const order: StoredOrder = {
      id: orderId,
      status: (data.status as OrderStatus) ?? OrderStatus.pending,
      channel: String(data.channel),
      subtotalCents: Number(data.subtotalCents ?? 0),
      taxCents: Number(data.taxCents ?? 0),
      totalCents: Number(data.totalCents ?? 0),
      fulfillmentType: String(data.fulfillmentType ?? ''),
      pickupCode: (data.pickupCode as string | null) ?? null,
      createdAt: (data.createdAt as Date | undefined) ?? new Date(),
      items: [],
    };

    const nestedItems =
      data.items && 'create' in data.items ? data.items.create : undefined;
    const creates = Array.isArray(nestedItems)
      ? nestedItems
      : nestedItems
        ? [nestedItems]
        : [];

    for (const item of creates) {
      const stored: StoredOrderItem = {
        id: randomUUID(),
        orderId,
        productId: String(item.productId),
        qty: Number(item.qty ?? 0),
        unitPriceCents: (item.unitPriceCents as number | null) ?? null,
        optionsJson: (item.optionsJson as Prisma.JsonValue | null) ?? null,
      };
      order.items.push(stored);
    }

    this.orders.push(order);
    return this.projectOrder(order, args);
  }

  private findMany(args: Prisma.OrderFindManyArgs = {}) {
    const selection = {
      select: args.select ?? null,
      include: args.include ?? null,
    };
    let results = [...this.orders];

    const createdAtWhere = args.where?.createdAt;
    if (createdAtWhere?.gte) {
      results = results.filter(
        (order) => order.createdAt >= createdAtWhere.gte!,
      );
    }
    if (createdAtWhere?.gt) {
      results = results.filter((order) => order.createdAt > createdAtWhere.gt!);
    }
    if (createdAtWhere?.lte) {
      results = results.filter(
        (order) => order.createdAt <= createdAtWhere.lte!,
      );
    }
    if (createdAtWhere?.lt) {
      results = results.filter((order) => order.createdAt < createdAtWhere.lt!);
    }

    const orderBy = args.orderBy;
    if (orderBy && 'createdAt' in orderBy && orderBy.createdAt) {
      const direction = orderBy.createdAt === 'desc' ? -1 : 1;
      results.sort(
        (a, b) => (a.createdAt.getTime() - b.createdAt.getTime()) * direction,
      );
    }

    if (typeof args.skip === 'number' && args.skip > 0) {
      results = results.slice(args.skip);
    }

    if (typeof args.take === 'number') {
      const take = args.take >= 0 ? args.take : 0;
      results = results.slice(0, take);
    }

    return results.map((order) => this.projectOrder(order, selection));
  }

  private findUnique(args: Prisma.OrderFindUniqueArgs) {
    const selection = {
      select: args.select ?? null,
      include: args.include ?? null,
    };
    const id = args.where.id;
    const found = this.orders.find((order) => order.id === id);
    return found ? this.projectOrder(found, selection) : null;
  }

  private updateOrder(args: Prisma.OrderUpdateArgs) {
    const selection = {
      select: args.select ?? null,
      include: args.include ?? null,
    };
    const id = args.where.id;
    const order = this.orders.find((o) => o.id === id);
    if (!order) {
      throw new Error(`Order ${id} not found`);
    }

    if (args.data.status) {
      order.status = args.data.status as OrderStatus;
    }
    if (args.data.pickupCode) {
      order.pickupCode = args.data.pickupCode as string;
    }
    if (args.data.subtotalCents) {
      order.subtotalCents = Number(args.data.subtotalCents);
    }
    if (args.data.taxCents) {
      order.taxCents = Number(args.data.taxCents);
    }
    if (args.data.totalCents) {
      order.totalCents = Number(args.data.totalCents);
    }

    return this.projectOrder(order, selection);
  }

  private projectOrder(
    order: StoredOrder,
    selection: {
      select: Prisma.OrderSelect | null;
      include: Prisma.OrderInclude | null;
    },
  ) {
    if (selection.select) {
      const projected: Record<string, unknown> = {};
      for (const [key, enabled] of Object.entries(selection.select)) {
        if (!enabled) continue;
        if (key === 'items') {
          projected.items = order.items.map((item) => ({ ...item }));
        } else {
          projected[key] = (order as unknown as Record<string, unknown>)[key];
        }
      }
      return projected;
    }

    const cloned: Record<string, unknown> = { ...order };
    if (selection.include?.items) {
      cloned.items = order.items.map((item) => ({ ...item }));
    } else {
      delete cloned.items;
    }
    return cloned;
  }
}

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let http: SuperTest<Test>;
  let prismaStub: InMemoryPrismaService;

  beforeAll(async () => {
    prismaStub = new InMemoryPrismaService();

    const moduleFixture: TestingModule = await NestTest.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    prismaStub.reset();
  });

  it('GET /api/health', async () => {
    await http.get('/api/health').expect(200).expect({ status: 'ok' });
  });

  it('GET /api', async () => {
    await http.get('/api').expect(200).expect({ ok: true });
  });
});
