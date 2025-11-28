// apps/api/src/orders/dto/order-summary.dto.ts

export class OrderSummaryLineItemDto {
  productId!: string;
  /** 根据 displayName/nameEn/nameZh 选出的展示名 */
  name!: string;
  nameEn?: string | null;
  nameZh?: string | null;

  quantity!: number;
  unitPriceCents!: number;
  totalPriceCents!: number;

  /** 下单时的配料/加料等快照 */
  optionsJson?: unknown;
}

export class OrderSummaryDto {
  /** 内部 ID */
  orderId!: string;
  /** 稳定 ID（例如 SQ******），如果有的话 */
  clientRequestId?: string | null;
  /** 对顾客展示的订单号：优先 stableId */
  orderNumber!: string;

  currency!: string; // 先统一用 'CAD'

  subtotalCents!: number;
  taxCents!: number;
  deliveryFeeCents!: number;
  /** 通过公式反推的积分/折扣金额（分） */
  discountCents!: number;
  totalCents!: number;

  lineItems!: OrderSummaryLineItemDto[];
}
