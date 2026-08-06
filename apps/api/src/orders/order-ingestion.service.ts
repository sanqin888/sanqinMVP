import { Injectable } from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { OrderEventsBus } from '../messaging/order-events.bus';
import { PrismaService } from '../prisma/prisma.service';

export type NormalizedOrderItem = {
  productStableId: string;
  quantity: number;
  displayName: string;
  nameEn?: string | null;
  nameZh?: string | null;
  unitPriceCents: number;
  baseUnitPriceCents?: number | null;
  optionsUnitPriceCents?: number | null;
  options?: Prisma.InputJsonValue;
  external?: {
    itemId?: string | null;
    lineId?: string | null;
    instructions?: string | null;
    lineTotalCents?: number | null;
    publishedPriceCents?: number | null;
    channelBasePriceCents?: number | null;
    priceVarianceCents?: number | null;
    modifiers?: Array<{
      externalId: string | null;
      parentExternalId: string | null;
      displayName: string;
      quantity: number;
      priceDeltaCents: number;
      specialInstructions: string | null;
      snapshot: Prisma.InputJsonValue;
    }>;
  };
};

/** Channel switches are deliberately explicit: an external adapter must opt in. */
export type OrderIngestionPolicies = {
  verifyWebPayment: boolean;
  applyMembershipPoints: boolean;
  applyCoupons: boolean;
  persistExternalSnapshot: boolean;
  emitPaidLifecycleEvent: boolean;
};

export type NormalizedOrderInput = {
  channel: Channel;
  paymentMethod: PaymentMethod;
  externalOrderId?: string | null;
  clientRequestId: string;
  storeId?: string | null;
  status: OrderStatus;
  paidAt: Date;
  fulfillmentType: FulfillmentType;
  pickupCode?: string | null;
  amounts: {
    subtotalCents: number;
    subtotalAfterDiscountCents: number;
    couponDiscountCents: number;
    taxCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    paymentTotalCents: number;
  };
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  externalSnapshot?: {
    displayId?: string | null;
    notes?: string | null;
    estimatedReadyAt?: Date | null;
    priceVarianceCents?: number;
  };
  items: NormalizedOrderItem[];
};

export type IngestionResult = {
  action: 'created' | 'updated';
  status: OrderStatus;
  orderId: string;
  orderStableId: string;
};

@Injectable()
export class OrderIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEventsBus: OrderEventsBus,
  ) {}

  async ingest(
    input: NormalizedOrderInput,
    policies: OrderIngestionPolicies,
    withinTransaction?: (
      tx: Prisma.TransactionClient,
      result: IngestionResult,
    ) => Promise<void>,
  ): Promise<IngestionResult> {
    // These validations belong to Web/POS preparation. External adapters cannot
    // accidentally inherit them simply by calling this persistence boundary.
    if (policies.verifyWebPayment && input.channel !== Channel.web) {
      throw new Error(
        'Web payment verification can only be enabled for web orders',
      );
    }
    if (
      !policies.persistExternalSnapshot &&
      input.channel === Channel.ubereats
    ) {
      throw new Error(
        'External channel snapshot policy must be enabled for Uber Eats',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { clientRequestId: input.clientRequestId },
        select: {
          id: true,
          orderStableId: true,
          status: true,
          pickupCode: true,
        },
      });
      const statusRank: Record<OrderStatus, number> = {
        pending: 0,
        paid: 1,
        making: 2,
        ready: 3,
        completed: 4,
        refunded: 5,
      };
      const effectiveStatus =
        existing && statusRank[input.status] < statusRank[existing.status]
          ? existing.status
          : input.status;
      const data: Prisma.OrderUncheckedCreateInput = {
        channel: input.channel,
        paymentMethod: input.paymentMethod,
        clientRequestId: input.clientRequestId,
        storeId: input.storeId,
        status: effectiveStatus,
        paidAt: input.paidAt,
        fulfillmentType: input.fulfillmentType,
        pickupCode: input.pickupCode ?? existing?.pickupCode,
        contactName: input.contact?.name,
        contactEmail: input.contact?.email,
        contactPhone: input.contact?.phone,
        ...input.amounts,
        ...(policies.persistExternalSnapshot
          ? {
              externalDisplayId: input.externalSnapshot?.displayId,
              externalOrderNotes: input.externalSnapshot?.notes,
              externalEstimatedReadyAt:
                input.externalSnapshot?.estimatedReadyAt,
              externalPriceVarianceCents:
                input.externalSnapshot?.priceVarianceCents ?? 0,
            }
          : {}),
      };
      const saved = existing
        ? await tx.order.update({ where: { id: existing.id }, data })
        : await tx.order.create({ data });

      // Items are a channel-owned snapshot. Replacement plus the unique order
      // key makes webhook retries converge on exactly one order snapshot.
      await tx.orderItem.deleteMany({ where: { orderId: saved.id } });
      for (const item of input.items) {
        const created = await tx.orderItem.create({
          data: {
            orderId: saved.id,
            productStableId: item.productStableId,
            qty: item.quantity,
            displayName: item.displayName,
            nameEn: item.nameEn,
            nameZh: item.nameZh,
            unitPriceCents: item.unitPriceCents,
            baseUnitPriceCents: item.baseUnitPriceCents,
            optionsUnitPriceCents: item.optionsUnitPriceCents,
            optionsJson: item.options,
            externalItemId: item.external?.itemId,
            externalLineId: item.external?.lineId,
            externalSpecialInstructions: item.external?.instructions,
            externalLineTotalCents: item.external?.lineTotalCents,
            publishedPriceCents: item.external?.publishedPriceCents,
            uberBasePriceCents: item.external?.channelBasePriceCents,
            priceVarianceCents: item.external?.priceVarianceCents,
          },
        });
        if (item.external?.modifiers?.length) {
          await tx.uberOrderItemModifier.createMany({
            data: item.external.modifiers.map((modifier, sortOrder) => ({
              orderItemId: created.id,
              ...modifier,
              sortOrder,
            })),
          });
        }
      }
      const output: IngestionResult = {
        orderId: saved.id,
        orderStableId: saved.orderStableId,
        status: saved.status,
        action: existing ? 'updated' : 'created',
      };
      await withinTransaction?.(tx, output);
      return output;
    });

    if (
      policies.emitPaidLifecycleEvent &&
      result.action === 'created' &&
      result.status === OrderStatus.paid
    ) {
      this.orderEventsBus.emitOrderPaidVerified({
        orderId: result.orderId,
        amountCents: input.amounts.subtotalAfterDiscountCents,
        redeemValueCents: 0,
      });
    }
    return result;
  }

  async markAccepted(clientRequestId: string): Promise<boolean> {
    const existing = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true, paidAt: true },
    });
    if (!existing || existing.status !== OrderStatus.pending) return false;
    const acceptedAt = new Date();
    const updated = await this.prisma.order.updateMany({
      where: { id: existing.id, status: OrderStatus.pending },
      data: {
        status: OrderStatus.making,
        paidAt: existing.paidAt ?? acceptedAt,
        makingAt: acceptedAt,
      },
    });
    if (!updated.count) return false;
    this.orderEventsBus.emitOrderAccepted({
      orderId: existing.id,
      stableId: existing.orderStableId,
    });
    return true;
  }
}
