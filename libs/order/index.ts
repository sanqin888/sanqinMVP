export type { OrderStatus } from '@shared/menu';

export type OrderDiscountDisplaySource =
  | 'DAILY_SPECIAL'
  | 'COUPON'
  | 'AUTOMATIC_PROMOTION'
  | 'POS_MANUAL_DISCOUNT'
  | 'OTHER';

export type OrderDiscountDisplayEntry = {
  promotionStableId: string | null;
  source: OrderDiscountDisplaySource;
  title: string | null;
  titleZh: string | null;
  titleEn: string | null;
  productStableId: string | null;
  productName: string | null;
  productNameZh: string | null;
  productNameEn: string | null;
  discountCents: number;
};
export {
  IS_ORDER_ACTIVE,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_SEQUENCE,
  OrderStatuses,
} from '@shared/menu';
export {
  ChannelSchema,
  CreateOrderItemSchema,
  CreateOrderSchema,
  DeliveryDestinationSchema,
  DeliveryTypeSchema,
  FulfillmentTypeSchema,
  PaymentMethodSchema,
} from '@shared/menu';
export type {
  Channel,
  CreateOrderInput,
  CreateOrderItemInput,
  DeliveryDestinationInput,
  DeliveryType,
  FulfillmentType,
  PaymentMethod,
} from '@shared/menu';
export {
  resolveOrderPreparationMinutes,
  resolveOrderPrepStartAt,
  resolveOrderReadyForPickupAt,
} from './preparation-time';
