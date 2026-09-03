import { Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  OrderFulfillmentTiming,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { OrderEventsBus } from '../messaging/order-events.bus';
import { PrismaService } from '../prisma/prisma.service';
import type {
  IngestionResult,
  NormalizedOrderInput,
  OrderIngestionPolicies,
  OrderIngestionPort,
  OrderIngestionWithinTransaction,
} from './order-ingestion.contract';
import {
  resolveOrderPreparationMinutes,
  resolveOrderPrepStartAt,
} from './order-preparation-time.policy';

@Injectable()
export class OrderIngestionService implements OrderIngestionPort {
  private readonly logger = new Logger(OrderIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEventsBus: OrderEventsBus,
  ) {}

  async ingest(
    input: NormalizedOrderInput,
    policies: OrderIngestionPolicies,
    withinTransaction?: OrderIngestionWithinTransaction,
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

    const fulfillmentTiming =
      input.fulfillmentTiming ?? OrderFulfillmentTiming.IMMEDIATE;
    if (
      fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED &&
      !input.scheduledReadyAt
    ) {
      throw new Error('Scheduled orders require scheduledReadyAt');
    }
    const prepDurationMinutes =
      fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED
        ? resolveOrderPreparationMinutes(input.amounts.totalCents)
        : null;
    const prepStartAt =
      fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED &&
      input.scheduledReadyAt
        ? resolveOrderPrepStartAt(
            input.amounts.totalCents,
            input.scheduledReadyAt,
          )
        : null;

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
        storeId: input.storeStableId,
        status: effectiveStatus,
        paidAt: input.paidAt,
        fulfillmentType: input.fulfillmentType,
        fulfillmentTiming,
        scheduledReadyAt: input.scheduledReadyAt ?? null,
        prepDurationMinutes,
        prepStartAt,
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
              externalModifierId: modifier.externalId,
              parentExternalId: modifier.parentExternalId,
              displayName: modifier.displayName,
              quantity: modifier.quantity,
              priceDeltaCents: modifier.priceDeltaCents,
              specialInstructions: modifier.specialInstructions,
              snapshot: modifier.snapshot,
              orderItemId: created.id,
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

    if (
      fulfillmentTiming === OrderFulfillmentTiming.SCHEDULED &&
      result.action === 'created' &&
      (result.status === OrderStatus.pending ||
        result.status === OrderStatus.paid)
    ) {
      this.logger.log({
        event: 'scheduled_order_board_queued',
        orderStableId: result.orderStableId,
        externalOrderId: input.externalOrderId ?? null,
        channel: input.channel,
        status: result.status,
        scheduledReadyAt: input.scheduledReadyAt?.toISOString() ?? null,
        prepStartAt: prepStartAt?.toISOString() ?? null,
        prepDurationMinutes,
      });
    }
    return result;
  }
}
