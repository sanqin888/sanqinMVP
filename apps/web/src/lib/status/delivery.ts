export type DeliveryStatus =
  | 'pending'
  | 'assigning'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'failed';

export const DELIVERY_STATUS_SEQUENCE: readonly DeliveryStatus[] = [
  'pending',
  'assigning',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled',
  'failed',
] as const;

export const DELIVERY_STATUS_TRANSITIONS: Readonly<
  Record<DeliveryStatus, readonly DeliveryStatus[]>
> = {
  pending: ['assigning', 'cancelled'],
  assigning: ['assigned', 'cancelled'],
  assigned: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  cancelled: [],
  failed: [],
} as const;
