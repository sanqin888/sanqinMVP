import {
  Channel,
  DeliveryProvider,
  FulfillmentType,
  OrderAmendmentItemAction,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { PosGateway } from '../../pos/pos.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UberDirectDropoffDetails,
  UberDirectService,
} from '../../deliveries/uber-direct.service';
import type { PrintPosPayloadDto } from '../../pos/dto/print-pos-payload.dto';
import type { OrderItemOptionsSnapshot } from '../order-item-options';
import { PrintPosPayloadService } from '../print-pos-payload.service';
import { resolveConfiguredStoreId } from '../../common/store-id';

@Injectable()
export class FulfillmentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FulfillmentProcessor.name);

  private readonly onPaid = async (payload: {
    orderId: string;
    pickupTime?: string;
  }) => {
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.warn(`[Fulfillment] Order not found: ${payload.orderId}`);
      return;
    }

    if (
      order.fulfillmentType !== FulfillmentType.delivery ||
      order.deliveryProvider !== DeliveryProvider.UBER
    ) {
      return;
    }

    if (order.externalDeliveryId) {
      this.logger.log(
        `[Fulfillment] Skip Uber dispatch, already dispatched: ${payload.orderId}`,
      );
      return;
    }

    const checkoutIntent = await this.prisma.checkoutIntent.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      select: { metadataJson: true },
    });

    try {
      const destination = this.extractDropoff(
        checkoutIntent?.metadataJson ?? null,
        order,
      );
      if (!destination) {
        throw new Error('DELIVERY_DESTINATION_REQUIRED');
      }
      const response = await this.uberDirect.createDelivery({
        orderRef: order.clientRequestId ?? order.orderStableId,
        pickupCode: order.pickupCode ?? undefined,
        reference: order.clientRequestId ?? order.orderStableId,
        totalCents: order.totalCents ?? 0,
        items: order.items.map((item) => ({
          name: item.displayName || item.productStableId,
          quantity: item.qty,
          priceCents: item.unitPriceCents ?? undefined,
        })),
        destination,
        pickupReadyAt: this.parsePickupTime(payload.pickupTime),
      });

      await this.prisma.order.update({
        where: { id: order.id },
        data: { externalDeliveryId: response.deliveryId },
      });

      this.logger.log(`[Fulfillment] Uber dispatched: ${payload.orderId}`);
    } catch (error) {
      this.logger.error(
        `[Fulfillment] Uber dispatch failed for ${payload.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };

  private readonly onAccepted = async (payload: { orderId: string }) => {
    try {
      await this.handleAcceptedLifecycle(payload);
    } catch (error) {
      // The in-memory bus remains a best-effort fast path for same-process
      // orders. Durable lifecycle consumers call handleAcceptedLifecycle()
      // directly and own retry/lease semantics themselves.
      this.logger.error({
        event: 'accepted_order_processing_failed',
        orderId: payload.orderId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  };

  constructor(
    private readonly events: OrderEventsBus,
    private readonly prisma: PrismaService,
    private readonly uberDirect: UberDirectService,
    private readonly posGateway: PosGateway,
    private readonly printPosPayloadService: PrintPosPayloadService,
  ) {}

  onModuleInit() {
    this.events.onOrderPaidVerified(this.onPaid);
    this.events.onOrderAccepted(this.onAccepted);
  }

  onModuleDestroy() {
    this.events.offOrderPaidVerified(this.onPaid);
    this.events.offOrderAccepted(this.onAccepted);
  }

  /**
   * Durable Order-lifecycle entrypoint. Failures are rethrown so the outbox
   * consumer can retain/retry the event instead of acknowledging lost work.
   */
  async handleAcceptedLifecycle(payload: { orderId: string }): Promise<void> {
    this.logger.log({
      event: 'accepted_order_processing_started',
      orderId: payload.orderId,
    });

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        id: true,
        orderStableId: true,
        channel: true,
        storeId: true,
      },
    });

    if (!order) {
      this.logger.warn(`[Fulfillment] Order not found: ${payload.orderId}`);
      return;
    }

    if (order.channel === Channel.in_store) {
      this.logger.log(
        `[Fulfillment] Skip accepted auto print for in_store order: ${payload.orderId}`,
      );
      return;
    }

    let storeId = order.storeId;
    if (!storeId) {
      this.logger.error({
        event: 'accepted_print_store_missing',
        orderId: order.id,
        orderStableId: order.orderStableId,
        reason: 'STORE_ID_MISSING',
      });
      // Compatibility only: orders created before store ownership was
      // persisted still follow the deployment's controlled POS route.
      storeId = resolveConfiguredStoreId();
    }

    let printPayload: PrintPosPayloadDto;
    try {
      printPayload = await this.printPosPayloadService.getByStableId(
        order.orderStableId,
        'zh',
      );
    } catch (error) {
      this.logger.error({
        event: 'accepted_print_payload_failed',
        orderId: order.id,
        orderStableId: order.orderStableId,
        storeId,
        reason: 'PAYLOAD_BUILD_FAILED',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }

    const targets = { customer: true, kitchen: true };
    try {
      const job = await this.posGateway.sendPrintJob({
        orderId: order.id,
        orderStableId: order.orderStableId,
        storeId,
        kind: 'AUTO',
        data: { ...printPayload, targets },
      });
      this.logger.log({
        event: 'accepted_print_job_created',
        orderStableId: order.orderStableId,
        storeId,
        jobId: job.jobId,
        targets,
      });
    } catch (error) {
      this.logger.error({
        event: 'accepted_print_job_failed',
        orderId: order.id,
        orderStableId: order.orderStableId,
        storeId,
        reason: 'PRINT_JOB_CREATE_FAILED',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  @OnEvent('order.reprint')
  async handleOrderReprint(payload: {
    orderStableId: string;
    locale?: 'zh' | 'en';
    targets?: { customer?: boolean; kitchen?: boolean };
    cashReceivedCents?: number;
    cashChangeCents?: number;
  }) {
    this.logger.log(
      `[Fulfillment] Order reprint requested: ${payload.orderStableId}. Triggering POS print.`,
    );

    const printPayload = await this.printPosPayloadService.getByStableId(
      payload.orderStableId,
      payload.locale ?? 'zh',
    );

    const order = await this.prisma.order.findUnique({
      where: { orderStableId: payload.orderStableId },
      select: { id: true, storeId: true },
    });
    if (!order) {
      this.logger.error(
        `[Fulfillment] Reprint order not found: ${payload.orderStableId}`,
      );
      return;
    }
    // Orders created before store mapping was persisted have a null storeId.
    // Keep their established reprint route compatible with the configured POS.
    const storeId = order.storeId ?? resolveConfiguredStoreId();
    if (!order.storeId) {
      this.logger.warn({
        event: 'reprint_legacy_store_fallback',
        orderStableId: payload.orderStableId,
        storeId,
        reason: process.env.STORE_ID
          ? 'ORDER_STORE_ID_MISSING_USING_CONFIGURED_STORE'
          : 'ORDER_STORE_ID_MISSING_USING_DEFAULT_STORE',
      });
    }
    await this.posGateway.sendPrintJob({
      orderId: order.id,
      orderStableId: payload.orderStableId,
      storeId,
      kind: `REPRINT:${Date.now()}`,
      data: {
        ...printPayload,
        ...(payload.targets ? { targets: payload.targets } : {}),
        ...(typeof payload.cashReceivedCents === 'number'
          ? { cashReceivedCents: payload.cashReceivedCents }
          : {}),
        ...(typeof payload.cashChangeCents === 'number'
          ? { cashChangeCents: payload.cashChangeCents }
          : {}),
      },
    });
  }

  @OnEvent('order.amendment.print')
  async handleOrderAmendmentPrint(payload: {
    orderStableId: string;
    locale?: 'zh' | 'en';
    reason: string;
    operatorName: string;
    items: Array<{
      action: OrderAmendmentItemAction;
      productStableId: string;
      qty: number;
      unitPriceCents?: number | null;
      displayName?: string | null;
      nameEn?: string | null;
      nameZh?: string | null;
      optionsJson?: Prisma.InputJsonValue;
    }>;
  }) {
    try {
      const locale = payload.locale === 'en' ? 'en' : 'zh';
      const basePayload = await this.printPosPayloadService.getByStableId(
        payload.orderStableId,
        locale,
      );
      const order = await this.prisma.order.findUnique({
        where: { orderStableId: payload.orderStableId },
        select: { id: true, storeId: true },
      });
      if (!order) {
        this.logger.error({
          event: 'amendment_print_order_missing',
          orderStableId: payload.orderStableId,
        });
        return;
      }

      const storeId = order.storeId ?? resolveConfiguredStoreId();
      const reason = payload.reason.trim();
      const operatorName = payload.operatorName.trim();
      const headerNote =
        locale === 'zh'
          ? `原因: ${reason} / 操作人: ${operatorName}`
          : `Reason: ${reason} / Operator: ${operatorName}`;
      const headerItem = {
        productStableId: '__order_amendment__',
        nameZh: '****** 改单 ******',
        nameEn: '****** ORDER CHANGE ******',
        displayName: '****** 改单 / ORDER CHANGE ******',
        quantity: 1,
        lineTotalCents: 0,
        specialInstructions: headerNote,
        options: null,
      };
      const changedItems = payload.items.map((item) => {
        const isVoid = item.action === OrderAmendmentItemAction.VOID;
        const zhPrefix = isVoid ? '[取消]' : '[新增]';
        const enPrefix = isVoid ? '[VOID]' : '[ADD]';
        const baseZh =
          item.nameZh ??
          item.displayName ??
          item.nameEn ??
          item.productStableId;
        const baseEn =
          item.nameEn ??
          item.displayName ??
          item.nameZh ??
          item.productStableId;
        const quantity = Math.max(1, Math.round(item.qty));
        const unitPriceCents = Math.max(
          0,
          Math.round(item.unitPriceCents ?? 0),
        );
        return {
          productStableId: item.productStableId,
          nameZh: `${zhPrefix} ${baseZh}`,
          nameEn: `${enPrefix} ${baseEn}`,
          displayName: `${zhPrefix}/${enPrefix} ${
            item.displayName ?? baseEn
          }`,
          quantity,
          lineTotalCents: unitPriceCents * quantity,
          specialInstructions: null,
          options: Array.isArray(item.optionsJson)
            ? (item.optionsJson as OrderItemOptionsSnapshot)
            : null,
        };
      });
      const amendmentPayload: PrintPosPayloadDto = {
        ...basePayload,
        snapshot: {
          ...basePayload.snapshot,
          items: [headerItem, ...changedItems],
        },
      };

      const job = await this.posGateway.sendPrintJob({
        orderId: order.id,
        orderStableId: payload.orderStableId,
        storeId,
        kind: `AMENDMENT:${Date.now()}`,
        data: {
          ...amendmentPayload,
          targets: { customer: false, kitchen: true },
        },
      });
      this.logger.log({
        event: 'amendment_print_job_created',
        orderStableId: payload.orderStableId,
        storeId,
        jobId: job.jobId,
        itemCount: payload.items.length,
      });
    } catch (error) {
      // The amendment is already committed. Do not make staff repeat the
      // financial/item operation merely because its kitchen copy failed.
      this.logger.error({
        event: 'amendment_print_job_failed',
        orderStableId: payload.orderStableId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  private extractDropoff(
    metadata: Prisma.JsonValue | null,
    order: {
      contactPhone: string | null;
      contactName: string | null;
    },
  ): UberDirectDropoffDetails | null {
    const root = this.asRecord(metadata);
    const customer = this.asRecord(root?.customer);
    const deliveryDestination = this.asRecord(root?.deliveryDestination);
    if (!customer) return null;

    const addressLine1 =
      this.asString(deliveryDestination?.addressLine1) ??
      this.asString(customer.addressLine1);
    const city =
      this.asString(deliveryDestination?.city) ?? this.asString(customer.city);
    const province =
      this.asString(deliveryDestination?.province) ??
      this.asString(customer.province);
    const postalCode =
      this.asString(deliveryDestination?.postalCode) ??
      this.asString(customer.postalCode);
    const phone =
      this.asString(deliveryDestination?.phone) ??
      this.asString(customer.phone) ??
      order.contactPhone;

    if (!phone) {
      throw new Error(
        'DELIVERY_PHONE_REQUIRED: Uber Direct dropoff requires a phone',
      );
    }

    if (!addressLine1 || !city || !province || !postalCode) {
      return null;
    }

    const firstName = this.asString(customer.firstName) ?? '';
    const lastName = this.asString(customer.lastName) ?? '';

    return {
      name:
        [firstName, lastName].filter(Boolean).join(' ') ||
        order.contactName ||
        'Customer',
      phone,
      addressLine1,
      addressLine2:
        this.asString(deliveryDestination?.addressLine2) ??
        this.asString(customer.addressLine2),
      city,
      province,
      postalCode,
      country:
        this.asString(deliveryDestination?.country) ??
        this.asString(customer.country) ??
        'Canada',
      instructions: this.asString(customer.notes),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private parsePickupTime(pickupTime?: string): Date | undefined {
    if (!pickupTime) return undefined;
    const parsed = new Date(pickupTime);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private parseOrderItemOptions(
    optionsJson: Prisma.JsonValue | null,
  ): OrderItemOptionsSnapshot | null {
    return Array.isArray(optionsJson)
      ? (optionsJson as OrderItemOptionsSnapshot)
      : null;
  }

  private toPrintPosPayload(order: {
    orderStableId: string;
    clientRequestId: string | null;
    pickupCode: string | null;
    fulfillmentType: FulfillmentType;
    paymentMethod: PaymentMethod;
    channel: Channel;
    subtotalCents: number | null;
    taxCents: number | null;
    totalCents: number | null;
    subtotalAfterDiscountCents: number | null;
    couponDiscountCents: number | null;
    loyaltyRedeemCents: number | null;
    deliveryFeeCents: number | null;
    deliveryCostCents: number | null;
    deliverySubsidyCents: number | null;
    items: Array<{
      productStableId: string;
      nameZh: string | null;
      nameEn: string | null;
      displayName: string | null;
      qty: number;
      unitPriceCents: number | null;
      optionsJson: Prisma.JsonValue | null;
    }>;
  }): PrintPosPayloadDto {
    const paymentMethod = (() => {
      switch (order.paymentMethod) {
        case PaymentMethod.CASH:
          return 'cash';
        case PaymentMethod.CARD:
          return 'card';
        case PaymentMethod.WECHAT_ALIPAY:
          return 'wechat_alipay';
        case PaymentMethod.STORE_BALANCE:
          return 'store_balance';
        default:
          return order.channel === Channel.in_store ? 'cash' : 'card';
      }
    })();

    const deliveryFeeCents = order.deliveryFeeCents ?? 0;
    const deliveryCostCents = order.deliveryCostCents ?? 0;
    const deliverySubsidyCentsRaw = order.deliverySubsidyCents;
    const deliverySubsidyCents =
      typeof deliverySubsidyCentsRaw === 'number' &&
      Number.isFinite(deliverySubsidyCentsRaw)
        ? Math.max(0, Math.round(deliverySubsidyCentsRaw))
        : Math.max(0, deliveryCostCents - deliveryFeeCents);

    return {
      locale: 'zh',
      orderNumber: order.clientRequestId ?? order.orderStableId,
      customerName: null,
      pickupCode: order.pickupCode,
      fulfillment: order.fulfillmentType,
      paymentMethod,
      orderNotes: null,
      utensils: null,
      snapshot: {
        items: order.items.map((item) => ({
          productStableId: item.productStableId,
          nameZh: item.nameZh,
          nameEn: item.nameEn,
          displayName: item.displayName,
          quantity: item.qty,
          lineTotalCents: (item.unitPriceCents ?? 0) * item.qty,
          specialInstructions: null,
          options: this.parseOrderItemOptions(item.optionsJson),
        })),
        subtotalCents: order.subtotalCents ?? 0,
        taxCents: order.taxCents ?? 0,
        totalCents: order.totalCents ?? 0,
        creditCardSurchargeCents: 0,
        discountCents: Math.max(
          0,
          (order.subtotalCents ?? 0) -
            (order.subtotalAfterDiscountCents ?? order.subtotalCents ?? 0),
        ),
        deliveryFeeCents,
        deliveryCostCents,
        deliverySubsidyCents,
      },
    };
  }
}
