// apps/api/src/pos/pos-summary.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PosPaymentBucket = 'cash' | 'card' | 'online' | 'unknown';
export type PosStatusBucket = 'paid' | 'refunded' | 'void';

export type PosDailySummaryResponse = {
  timeMin: string;
  timeMax: string;
  totals: {
    orders: number;
    salesCents: number;
    taxCents: number;
    discountCents: number;
    refundCents: number;
    netCents: number;
  };
  breakdownByPayment: Array<{
    payment: PosPaymentBucket;
    count: number;
    amountCents: number; // net
  }>;
  breakdownByFulfillment: Array<{
    fulfillmentType: 'pickup' | 'dine_in' | 'delivery';
    count: number;
    amountCents: number; // net
  }>;
  orders: Array<{
    orderStableId: string;
    clientRequestId: string | null;
    createdAt: string;

    channel: 'web' | 'in_store' | 'ubereats';
    fulfillmentType: 'pickup' | 'dine_in' | 'delivery';

    // 常见状态示例：pending/paid/making/ready/completed/refunded
    status: string; // 兼容未来扩展
    statusBucket: PosStatusBucket;

    payment: PosPaymentBucket;

    totalCents: number;
    taxCents: number;
    discountCents: number;

    refundCents: number;
    additionalChargeCents: number;

    netCents: number;
  }>;
};

type SummaryQuery = {
  timeMin: string; // ISO
  timeMax: string; // ISO (exclusive)
  fulfillmentType?: string;
  status?: string; // paid|refunded|void
  payment?: string; // cash|card|online|unknown
};

type OrderLite = {
  id: string;
  orderStableId: string | null;
  clientRequestId: string | null;
  paidAt: Date;
  channel: Channel;
  fulfillmentType: FulfillmentType;
  status: string;
  totalCents: number;
  taxCents: number;
  loyaltyRedeemCents: number | null;
  couponDiscountCents: number | null;
  paymentMethod: PaymentMethod;
};

@Injectable()
export class PosSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  private parseIsoInstant(value: string, field: string): Date {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO datetime`);
    }
    return d;
  }

  private toFulfillment(
    v: unknown,
  ): 'pickup' | 'dine_in' | 'delivery' | undefined {
    if (typeof v !== 'string' || v.trim().length === 0) return undefined;
    const s = v.trim().toLowerCase();
    if (s === 'pickup' || s === 'dine_in' || s === 'delivery') return s;
    return undefined;
  }

  private toStatusBucket(v: unknown): PosStatusBucket | undefined {
    if (typeof v !== 'string' || v.trim().length === 0) return undefined;
    const s = v.trim().toLowerCase();
    if (s === 'paid' || s === 'refunded' || s === 'void') return s;
    return undefined;
  }

  private toPaymentBucket(v: unknown): PosPaymentBucket | undefined {
    if (typeof v !== 'string' || v.trim().length === 0) return undefined;
    const s = v.trim().toLowerCase();
    if (s === 'cash' || s === 'card' || s === 'online' || s === 'unknown')
      return s;
    return undefined;
  }

  private computeStatusBucket(status: string): PosStatusBucket {
    const s = (status || '').toLowerCase();
    if (s === 'refunded') return 'refunded';
    if (s === 'void' || s === 'voided' || s === 'canceled' || s === 'cancelled')
      return 'void';
    // 你的业务前提：订单只在收款后落库，所以默认归 paid
    return 'paid';
  }

  /**
   * ✅ 统一 payment bucket：
   * - web / ubereats：归 online
   * - in_store：看 paymentMethod（CASH/CARD/WECHAT_ALIPAY）
   */
  private computePaymentBucket(
    o: Pick<OrderLite, 'channel' | 'paymentMethod'>,
  ): PosPaymentBucket {
    if (o.channel === Channel.web) return 'online';
    if (o.channel === Channel.ubereats) return 'online';

    switch (o.paymentMethod) {
      case PaymentMethod.CASH:
        return 'cash';
      case PaymentMethod.CARD:
        return 'card';
      case PaymentMethod.WECHAT_ALIPAY:
        return 'online';
      default:
        return 'unknown';
    }
  }

  private cents(v: unknown): number {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  }

  async summary(q: SummaryQuery): Promise<PosDailySummaryResponse> {
    const start = this.parseIsoInstant(q.timeMin, 'timeMin');
    const end = this.parseIsoInstant(q.timeMax, 'timeMax');
    if (!(start.getTime() < end.getTime())) {
      throw new BadRequestException('timeMin must be < timeMax');
    }

    const fulfillmentFilter = this.toFulfillment(q.fulfillmentType);
    const statusFilter = this.toStatusBucket(q.status);
    const paymentFilter = this.toPaymentBucket(q.payment);

    // 1) 先取 paidAt 落在区间内的订单（timeMax 用 lt，和前端 end+1day 的设计对齐）
    const where: Prisma.OrderWhereInput = {
      paidAt: { gte: start, lt: end },
      ...(fulfillmentFilter ? { fulfillmentType: fulfillmentFilter } : {}),
    };

    const orders = (await this.prisma.order.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      select: {
        id: true,
        orderStableId: true,
        clientRequestId: true,
        paidAt: true,
        channel: true,
        fulfillmentType: true,
        status: true,
        totalCents: true,
        taxCents: true,
        loyaltyRedeemCents: true,
        couponDiscountCents: true,
        paymentMethod: true,
      },
    })) as unknown as OrderLite[];

    if (orders.length === 0) {
      return {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        totals: {
          orders: 0,
          salesCents: 0,
          taxCents: 0,
          discountCents: 0,
          refundCents: 0,
          netCents: 0,
        },
        breakdownByPayment: [
          { payment: 'cash', count: 0, amountCents: 0 },
          { payment: 'card', count: 0, amountCents: 0 },
          { payment: 'online', count: 0, amountCents: 0 },
          { payment: 'unknown', count: 0, amountCents: 0 },
        ],
        breakdownByFulfillment: [
          { fulfillmentType: 'pickup', count: 0, amountCents: 0 },
          { fulfillmentType: 'dine_in', count: 0, amountCents: 0 },
          { fulfillmentType: 'delivery', count: 0, amountCents: 0 },
        ],
        orders: [],
      };
    }

    const orderIds = orders.map((o) => o.id);

    // 2) 订单维度聚合：退款/补收（来自 OrderAmendment）
    const amendAgg = await this.prisma.orderAmendment.groupBy({
      by: ['orderId'],
      where: { orderId: { in: orderIds } },
      _sum: { refundCents: true, additionalChargeCents: true },
    });

    const amendMap = new Map<
      string,
      { refundCents: number; additionalChargeCents: number }
    >();
    for (const row of amendAgg) {
      amendMap.set(row.orderId, {
        refundCents: this.cents(row._sum.refundCents),
        additionalChargeCents: this.cents(row._sum.additionalChargeCents),
      });
    }

    // 3) 组装订单行 + 应用 status/payment 过滤（因为 payment bucket 不是纯 DB 字段）
    const rows = orders
      .map((o) => {
        const amend = amendMap.get(o.id) ?? {
          refundCents: 0,
          additionalChargeCents: 0,
        };

        const discountCents =
          this.cents(o.loyaltyRedeemCents) + this.cents(o.couponDiscountCents);

        const statusBucket = this.computeStatusBucket(o.status);
        const payment = this.computePaymentBucket(o);
        const channel: PosDailySummaryResponse['orders'][number]['channel'] =
          o.channel === Channel.web
            ? 'web'
            : o.channel === Channel.ubereats
              ? 'ubereats'
              : 'in_store';

        const netCents =
          this.cents(o.totalCents) -
          amend.refundCents +
          amend.additionalChargeCents;

        if (!o.orderStableId) {
          throw new BadRequestException('orderStableId missing');
        }

        return {
          orderStableId: o.orderStableId,
          clientRequestId: o.clientRequestId ?? null,
          createdAt: o.paidAt.toISOString(),

          channel,
          fulfillmentType: o.fulfillmentType as
            | 'pickup'
            | 'dine_in'
            | 'delivery',

          status: o.status,
          statusBucket,

          payment,

          totalCents: this.cents(o.totalCents),
          taxCents: this.cents(o.taxCents),
          discountCents,

          refundCents: amend.refundCents,
          additionalChargeCents: amend.additionalChargeCents,

          netCents,
        };
      })
      .filter((r) => (statusFilter ? r.statusBucket === statusFilter : true))
      .filter((r) => (paymentFilter ? r.payment === paymentFilter : true));

    // 4) totals
    let salesCents = 0;
    let taxCents = 0;
    let discountCents = 0;
    let refundCents = 0;
    let netCents = 0;

    for (const r of rows) {
      salesCents += r.totalCents;
      taxCents += r.taxCents;
      discountCents += r.discountCents;
      refundCents += r.refundCents;
      netCents += r.netCents;
    }

    // 5) breakdowns
    const paymentBuckets: PosPaymentBucket[] = [
      'cash',
      'card',
      'online',
      'unknown',
    ];
    const payMap = new Map<
      PosPaymentBucket,
      { count: number; amountCents: number }
    >(paymentBuckets.map((p) => [p, { count: 0, amountCents: 0 }]));

    const fulfillBuckets: Array<'pickup' | 'dine_in' | 'delivery'> = [
      'pickup',
      'dine_in',
      'delivery',
    ];
    const fMap = new Map<
      'pickup' | 'dine_in' | 'delivery',
      { count: number; amountCents: number }
    >(fulfillBuckets.map((f) => [f, { count: 0, amountCents: 0 }]));

    for (const r of rows) {
      const p = payMap.get(r.payment) ?? payMap.get('unknown')!;
      p.count += 1;
      p.amountCents += r.netCents;

      const f = fMap.get(r.fulfillmentType);
      if (f) {
        f.count += 1;
        f.amountCents += r.netCents;
      }
    }

    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      totals: {
        orders: rows.length,
        salesCents,
        taxCents,
        discountCents,
        refundCents,
        netCents,
      },
      breakdownByPayment: paymentBuckets.map((p) => ({
        payment: p,
        count: payMap.get(p)!.count,
        amountCents: payMap.get(p)!.amountCents,
      })),
      breakdownByFulfillment: fulfillBuckets.map((f) => ({
        fulfillmentType: f,
        count: fMap.get(f)!.count,
        amountCents: fMap.get(f)!.amountCents,
      })),
      orders: rows,
    };
  }
}
