import { randomUUID } from 'node:crypto';
import request, { SuperTest, Test } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp, getApiPrefix } from '../src/app.bootstrap';

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
  clientRequestId: string | null;
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
      clientRequestId: data.clientRequestId ?? null,
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
    const clientRequestId = args.where.clientRequestId;
    const found = this.orders.find((order) => {
      if (id) return order.id === id;
      if (clientRequestId) {
        return order.clientRequestId === clientRequestId;
      }
      return false;
    });
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
    configureApp(app);
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

  const apiPrefix = `/${getApiPrefix()}`;

  it('GET /api/v1/health returns envelope', async () => {
    await http
      .get(`${apiPrefix}/health`)
      .expect(200)
      .expect(({ body }) => {
        const envelope = body as {
          code: string;
          message: string;
          details: Record<string, unknown>;
        };
        expect(envelope.code).toBe('OK');
        expect(envelope.message).toBe('success');
        expect(envelope.details).toMatchObject({ status: 'ok' });
        expect(envelope.details).toHaveProperty('timestamp');
      });
  });

  it('GET /api/v1 returns service metadata', async () => {
    await http
      .get(apiPrefix)
      .expect(200)
      .expect(({ body }) => {
        const envelope = body as {
          code: string;
          message: string;
          details: Record<string, unknown>;
        };
        expect(envelope).toEqual({
          code: 'OK',
          message: 'success',
          details: {
            service: 'sanqin-api',
            version: getApiPrefix(),
          },
        });
      });
  });

  it('POST /api/v1/orders tolerates invalid idempotency key', async () => {
    const response = await http
      .post(`${apiPrefix}/orders`)
      .set('Idempotency-Key', 'demo-order')
      .send({
        channel: 'web',
        fulfillmentType: 'pickup',
        items: [{ productId: 'americano', qty: 1 }],
        subtotal: 10,
        taxTotal: 0,
        total: 10,
      })
      .expect(201);

    const envelope = response.body as {
      code: string;
      message: string;
      details: Record<string, unknown>;
    };

    expect(envelope.code).toBe('OK');
    expect(envelope.message).toBe('success');
    expect(envelope.details).toMatchObject({
      channel: 'web',
      fulfillmentType: 'pickup',
      subtotalCents: 1000,
      taxCents: 130,
      totalCents: 1130,
      clientRequestId: null,
      items: [
        {
          productId: 'americano',
          qty: 1,
          unitPriceCents: null,
        },
      ],
    });
  });

  it('POST /api/v1/orders reuses existing order for a stable idempotency key', async () => {
    const key = randomUUID();
    const payload = {
      channel: 'web',
      fulfillmentType: 'pickup',
      items: [{ productId: 'latte', qty: 2 }],
      subtotal: 20,
      taxTotal: 0,
      total: 20,
    };

    const first = await http
      .post(`${apiPrefix}/orders`)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    const second = await http
      .post(`${apiPrefix}/orders`)
      .set('Idempotency-Key', key)
      .send({ ...payload, subtotal: 25 })
      .expect(201);

    const firstEnvelope = first.body as {
      details: { id: string; clientRequestId: string };
    };
    const secondEnvelope = second.body as {
      details: { id: string; clientRequestId: string };
    };

    expect(firstEnvelope.details.id).toBeTruthy();
    expect(secondEnvelope.details.id).toBe(firstEnvelope.details.id);
    expect(firstEnvelope.details.clientRequestId).toBe(key);
    expect(secondEnvelope.details.clientRequestId).toBe(key);
  });
});
