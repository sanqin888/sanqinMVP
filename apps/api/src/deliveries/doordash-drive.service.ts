import { Injectable } from '@nestjs/common';

export interface DoorDashDropoffDetails {
  name: string;
  phone: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface DoorDashManifestItem {
  name: string;
  quantity: number;
  priceCents?: number;
}

export interface DoorDashDeliveryOptions {
  orderRef: string;
  pickupCode?: string;
  reference?: string;
  totalCents: number;
  items: DoorDashManifestItem[];
  destination: DoorDashDropoffDetails;
}

export interface DoorDashDeliveryResult {
  deliveryId: string;
  status?: string;
  etaRange?: [number, number];
  deliveryFeeCents?: number;
  deliveryCostCents?: number;
  raw?: unknown;
}

/**
 * DoorDash has been sunset for this project.
 * This service intentionally rejects all calls to avoid accidental usage.
 */
@Injectable()
export class DoorDashDriveService {
  createDelivery(
    options: DoorDashDeliveryOptions,
  ): Promise<DoorDashDeliveryResult> {
    void options;
    return Promise.reject(
      new Error('DoorDash delivery is deprecated and no longer supported.'),
    );
  }
}
