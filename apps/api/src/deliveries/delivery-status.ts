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

export const DELIVERY_STATUS_SEQUENCE: readonly DeliveryStatus[] = [
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
  Record<DeliveryStatus, readonly DeliveryStatus[]>
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
