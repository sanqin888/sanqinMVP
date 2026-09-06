export const UBER_DIRECT_DELIVERY_DISPATCHER = Symbol(
  'UBER_DIRECT_DELIVERY_DISPATCHER',
);

export interface UberDirectDropoffDetails {
  name: string;
  phone: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  country?: string;
  instructions?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  tipCents?: number;
}

export interface UberDirectPickupDetails {
  businessName?: string;
  contactName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  instructions?: string;
  latitude?: number;
  longitude?: number;
}

export interface UberDirectManifestItem {
  name: string;
  quantity: number;
  priceCents?: number | null;
}

export interface UberDirectDeliveryOptions {
  orderRef: string;
  pickupCode?: string | null;
  reference?: string | null;
  totalCents: number;
  items: UberDirectManifestItem[];
  destination: UberDirectDropoffDetails;
  pickup?: UberDirectPickupDetails;
  pickupReadyAt?: Date;
}

export interface UberDirectDeliveryResult {
  deliveryId: string;
  externalDeliveryId: string;
  status?: string;
  trackingUrl?: string;
  deliveryCostCents?: number;
}

export interface UberDirectDeliveryDispatcherPort {
  createDelivery(
    options: UberDirectDeliveryOptions,
  ): Promise<UberDirectDeliveryResult>;
}
