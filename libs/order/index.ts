export {
  ChannelSchema,
  CreateOrderItemSchema,
  CreateOrderSchema,
  DeliveryDestinationSchema,
  DeliveryTypeSchema,
  FulfillmentTypeSchema,
  IS_ORDER_ACTIVE,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_SEQUENCE,
  OrderStatuses,
  PaymentMethodSchema,
} from './contracts';
export type {
  Channel,
  CreateOrderInput,
  CreateOrderItemInput,
  DeliveryDestinationInput,
  DeliveryProvider,
  DeliveryType,
  FulfillmentType,
  OrderFulfillmentTiming,
  OrderJsonValue,
  OrderStatus,
  PaymentMethod,
} from './contracts';

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
  resolveOrderPreparationMinutes,
  resolveOrderPrepStartAt,
  resolveOrderReadyForPickupAt,
} from './preparation-time';
