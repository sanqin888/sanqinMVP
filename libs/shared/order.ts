import { z } from 'zod';

export type Channel = 'web' | 'in_store' | 'ubereats';
export type FulfillmentType = 'pickup' | 'dine_in' | 'delivery';
export type DeliveryType = 'STANDARD' | 'PRIORITY';
export type PaymentMethod = 'CASH' | 'CARD' | 'WECHAT_ALIPAY' | 'STORE_BALANCE';

export const OrderStatuses = [
  'pending',
  'paid',
  'making',
  'ready',
  'completed',
  'refunded',
] as const;
export type OrderStatus = (typeof OrderStatuses)[number];

export const ORDER_STATUS_SEQUENCE: readonly OrderStatus[] = OrderStatuses;

export const ORDER_STATUS_FLOW: Readonly<
  Record<OrderStatus, OrderStatus | null>
> = {
  pending: 'paid',
  paid: 'making',
  making: 'ready',
  ready: 'completed',
  completed: null,
  refunded: null,
};

export const IS_ORDER_ACTIVE = (status: OrderStatus) =>
  !['completed', 'refunded'].includes(status);

export const ChannelSchema = z.enum(['web', 'in_store', 'ubereats']);
export const FulfillmentTypeSchema = z.enum(['pickup', 'dine_in', 'delivery']);
export const DeliveryTypeSchema = z.enum(['STANDARD', 'PRIORITY']);
export const PaymentMethodSchema = z.enum([
  'CASH',
  'CARD',
  'WECHAT_ALIPAY',
  'STORE_BALANCE',
]);

export const CreateOrderItemSchema = z.object({
  productStableId: z.string(),
  qty: z.number().int().min(1),
  displayName: z.string().optional(),
  nameEn: z.string().optional(),
  nameZh: z.string().optional(),
  unitPrice: z.number().optional(),
  options: z.record(z.unknown()).optional(),
});

export const DeliveryDestinationSchema = z.object({
  name: z.string(),
  phone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  country: z.string().optional(),
  company: z.string().optional(),
  instructions: z.string().optional(),
  notes: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  tipCents: z.number().int().optional(),
});

export const CreateOrderSchema = z.object({
  userStableId: z.string().optional(),
  orderStableId: z.string().optional(),
  clientRequestId: z.string().optional(),
  pickupCode: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  channel: ChannelSchema,
  fulfillmentType: FulfillmentTypeSchema,
  paymentMethod: PaymentMethodSchema.optional(),
  deliveryType: DeliveryTypeSchema.optional(),
  items: z.array(CreateOrderItemSchema).optional(),
  pointsToRedeem: z.number().int().min(0).optional(),
  redeemValueCents: z.number().int().min(0).optional(),
  subtotalCents: z.number().int().min(0).optional(),
  taxCents: z.number().int().min(0).optional(),
  totalCents: z.number().int().min(0).optional(),
  deliveryFeeCents: z.number().int().min(0).optional(),
  couponStableId: z.string().optional(),
  selectedUserCouponId: z.string().optional(),
  deliveryDestination: DeliveryDestinationSchema.optional(),
});

export type CreateOrderItemInput = z.infer<typeof CreateOrderItemSchema>;
export type DeliveryDestinationInput = z.infer<typeof DeliveryDestinationSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
