// libs/status/delivery-status.ts

export enum DeliveryStatus {
  pending = 'pending',
  assigning = 'assigning',
  assigned = 'assigned',
  picked_up = 'picked_up',
  in_transit = 'in_transit',
  delivered = 'delivered',
  cancelled = 'cancelled',
  failed = 'failed',
}

// 构造一个 value 类型，前端/后端都可以用
export type DeliveryStatusValue = `${DeliveryStatus}`;

export const DELIVERY_STATUS_SEQUENCE: readonly DeliveryStatusValue[] = [
  DeliveryStatus.pending,
  DeliveryStatus.assigning,
  DeliveryStatus.assigned,
  DeliveryStatus.picked_up,
  DeliveryStatus.in_transit,
  DeliveryStatus.delivered,
  DeliveryStatus.cancelled,
  DeliveryStatus.failed,
] as const;

export const DELIVERY_STATUS_TRANSITIONS: Readonly<
  Record<DeliveryStatusValue, readonly DeliveryStatusValue[]>
> = {
  pending: [DeliveryStatus.assigning, DeliveryStatus.cancelled],
  assigning: [DeliveryStatus.assigned, DeliveryStatus.cancelled],
  assigned: [DeliveryStatus.picked_up, DeliveryStatus.cancelled],
  picked_up: [DeliveryStatus.in_transit, DeliveryStatus.failed],
  in_transit: [DeliveryStatus.delivered, DeliveryStatus.failed],
  delivered: [],
  cancelled: [],
  failed: [],
} as const;
