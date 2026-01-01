// apps/api/src/deliveries/doordash-drive.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as jwt from 'jsonwebtoken';
import type { JwtHeader, SignOptions } from 'jsonwebtoken';
import { normalizeExternalOrderRef } from '../common/utils/external-id';

/* =========================
 * Types
 * ========================= */

interface DoorDashTokenConfig {
  developerId: string;
  keyId: string;
  signingSecret: string;
}

export interface DoorDashDropoffDetails {
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

export interface DoorDashManifestItem {
  name: string;
  quantity: number;
  priceCents?: number | null;
}

export interface DoorDashDeliveryOptions {
  orderRef: string;
  pickupCode?: string | null;
  reference?: string | null;
  totalCents: number;
  items: DoorDashManifestItem[];
  destination: DoorDashDropoffDetails;
}

export interface DoorDashDeliveryResult {
  deliveryId: string;
  externalDeliveryId: string;
  status?: string;
  trackingUrl?: string;
  deliveryCostCents?: number;
}

interface PickupConfig {
  businessName: string;
  contactName?: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  instructions?: string;
  latitude?: number;
  longitude?: number;
}

/* =========================
 * Utils
 * ========================= */

type AxiosErrorLike = {
  isAxiosError?: boolean;
  response?: {
    status?: number;
    data?: unknown;
  };
  message?: string;
  stack?: string;
};

const trimToUndefined = (
  value: string | undefined | null,
): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const compact = (source: Record<string, unknown>): Record<string, unknown> => {
  return Object.entries(source).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (value === undefined || value === null) return acc;
      if (typeof value === 'string' && value.trim() === '') return acc;
      acc[key] = value;
      return acc;
    },
    {},
  );
};

const splitName = (raw?: string) => {
  const value = trimToUndefined(raw);
  if (!value) return { first: undefined, last: undefined };
  const parts = value.split(/\s+/);
  const first = parts.shift();
  const last = parts.length > 0 ? parts.join(' ') : undefined;
  return { first, last };
};

const isAxiosErrorLike = (error: unknown): error is AxiosErrorLike => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as { isAxiosError?: boolean }).isAxiosError === true
  );
};

/* =========================
 * Service
 * ========================= */

@Injectable()
export class DoorDashDriveService {
  private readonly logger = new Logger(DoorDashDriveService.name);

  private readonly apiBase: string;
  private readonly tokenConfig: DoorDashTokenConfig;
  private readonly pickup: PickupConfig;

  constructor(private readonly http: HttpService) {
    this.apiBase = (
      process.env.DOORDASH_DRIVE_API_BASE ?? 'https://openapi.doordash.com'
    ).replace(/\/+$/, '');

    this.tokenConfig = {
      developerId: trimToUndefined(process.env.DOORDASH_DEVELOPER_ID) ?? '',
      keyId: trimToUndefined(process.env.DOORDASH_KEY_ID) ?? '',
      signingSecret: trimToUndefined(process.env.DOORDASH_SIGNING_SECRET) ?? '',
    };

    const businessName =
      trimToUndefined(process.env.DOORDASH_STORE_BUSINESS_NAME) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_BUSINESS_NAME) ??
      'San Qin Cafe';

    const contactName =
      trimToUndefined(process.env.DOORDASH_STORE_CONTACT) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_CONTACT);

    const phone =
      trimToUndefined(process.env.DOORDASH_STORE_PHONE) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_PHONE) ??
      '';

    const addressLine1 =
      trimToUndefined(process.env.DOORDASH_STORE_ADDRESS_LINE1) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_ADDRESS_LINE1) ??
      '';

    const addressLine2 =
      trimToUndefined(process.env.DOORDASH_STORE_ADDRESS_LINE2) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_ADDRESS_LINE2) ??
      undefined;

    const city =
      trimToUndefined(process.env.DOORDASH_STORE_CITY) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_CITY) ??
      '';

    const province =
      trimToUndefined(process.env.DOORDASH_STORE_PROVINCE) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_PROVINCE) ??
      '';

    const postalCode =
      trimToUndefined(process.env.DOORDASH_STORE_POSTAL_CODE) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_POSTAL_CODE) ??
      '';

    const country =
      trimToUndefined(process.env.DOORDASH_STORE_COUNTRY) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_COUNTRY) ??
      'Canada';

    this.pickup = {
      businessName,
      contactName,
      phone,
      addressLine1,
      addressLine2,
      city,
      province,
      postalCode,
      country,
      instructions: trimToUndefined(process.env.DOORDASH_STORE_INSTRUCTIONS),
      latitude: Number.isFinite(Number(process.env.STORE_LATITUDE))
        ? Number(process.env.STORE_LATITUDE)
        : undefined,
      longitude: Number.isFinite(Number(process.env.STORE_LONGITUDE))
        ? Number(process.env.STORE_LONGITUDE)
        : undefined,
    };
  }

  /* =========================
   * Auth
   * ========================= */

  private createAuthToken(): string {
    const header: JwtHeader = {
      alg: 'HS256',
      kid: this.tokenConfig.keyId,
      typ: 'JWT',
    };

    const payload = {
      iss: this.tokenConfig.developerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    };

    const options: SignOptions = { header };

    return jwt.sign(payload, this.tokenConfig.signingSecret, options);
  }

  /* =========================
   * Public API
   * ========================= */

  async createDelivery(
    options: DoorDashDeliveryOptions,
  ): Promise<DoorDashDeliveryResult> {
    this.ensureConfigured();
    const token = this.createAuthToken();
    const pickupName = splitName(this.pickup.contactName);
    const externalOrderRef = normalizeExternalOrderRef(options.orderRef);

    const payload = compact({
      external_delivery_id: externalOrderRef,
      pickup_business_name: this.pickup.businessName,
      pickup_phone_number: this.pickup.phone,
      pickup_address: this.pickup.addressLine1,
      pickup_address_2: this.pickup.addressLine2,
      pickup_city: this.pickup.city,
      pickup_state: this.pickup.province,
      pickup_zip_code: this.pickup.postalCode,
      pickup_country: this.pickup.country,
      pickup_instructions: this.pickup.instructions,
      pickup_latitude: this.pickup.latitude,
      pickup_longitude: this.pickup.longitude,
      pickup_contact_first_name: pickupName.first,
      pickup_contact_last_name: pickupName.last,
      dropoff_contact_given_name: options.destination.name,
      dropoff_phone_number: options.destination.phone,
      dropoff_address: options.destination.addressLine1,
      dropoff_address_2: options.destination.addressLine2,
      dropoff_city: options.destination.city,
      dropoff_state: options.destination.province,
      dropoff_zip_code: options.destination.postalCode,
      dropoff_country: options.destination.country ?? 'Canada',
      dropoff_instructions: options.destination.instructions,
      dropoff_latitude: options.destination.latitude,
      dropoff_longitude: options.destination.longitude,
      tip:
        typeof options.destination.tipCents === 'number'
          ? options.destination.tipCents / 100
          : undefined,
      order_value: options.totalCents / 100,
      items: options.items.map((item) =>
        compact({
          name: item.name,
          quantity: item.quantity,
          price:
            typeof item.priceCents === 'number'
              ? item.priceCents / 100
              : undefined,
        }),
      ),
    });

    try {
      const res = await firstValueFrom(
        this.http.post(`${this.apiBase}/drive/v2/deliveries`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      const data = res.data as Record<string, unknown>;
      const deliveryId =
        this.pickFirstString(data, ['delivery_id', 'id', 'deliveryId']) ?? '';
      const externalDeliveryId =
        this.pickFirstString(data, ['external_delivery_id']) ??
        externalOrderRef;

      return {
        deliveryId: deliveryId || externalDeliveryId,
        externalDeliveryId,
        status: typeof data['status'] === 'string' ? data['status'] : undefined,
        trackingUrl:
          typeof data['tracking_url'] === 'string'
            ? data['tracking_url']
            : undefined,
        deliveryCostCents:
          typeof data['fee'] === 'number'
            ? Math.round(data['fee'] * 100)
            : undefined,
      };
    } catch (err: unknown) {
      this.handleAxiosError('createDelivery', err);
      throw err;
    }
  }

  /* =========================
   * Error Handling
   * ========================= */

  private handleAxiosError(context: string, err: unknown): void {
    if (isAxiosErrorLike(err)) {
      const status =
        err.response && typeof err.response.status === 'number'
          ? err.response.status
          : undefined;
      const data: unknown = err.response?.data;
      const summary = this.extractErrorSummary(data);
      const payload = summary ? { status, ...summary } : { status };
      this.logger.error(
        `[${context}] DoorDash API error`,
        JSON.stringify(payload),
      );
      return;
    }

    if (err instanceof Error) {
      this.logger.error(`[${context}] ${err.message}`, err.stack);
      return;
    }

    this.logger.error(`[${context}] Unknown error`, JSON.stringify({ err }));
  }

  private ensureConfigured(): void {
    if (!this.tokenConfig.developerId) {
      throw new Error('DOORDASH_DEVELOPER_ID is not configured');
    }
    if (!this.tokenConfig.keyId) {
      throw new Error('DOORDASH_KEY_ID is not configured');
    }
    if (!this.tokenConfig.signingSecret) {
      throw new Error('DOORDASH_SIGNING_SECRET is not configured');
    }
  }

  private extractErrorSummary(
    data: unknown,
  ): Record<string, string> | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const record = data as Record<string, unknown>;
    const summary: Record<string, string> = {};
    const code =
      typeof record.code === 'string'
        ? record.code
        : typeof record.error_code === 'string'
          ? record.error_code
          : undefined;
    const message =
      typeof record.message === 'string'
        ? record.message
        : typeof record.error === 'string'
          ? record.error
          : undefined;
    const type = typeof record.type === 'string' ? record.type : undefined;

    if (code) summary.code = code;
    if (message) summary.message = message;
    if (type) summary.type = type;

    const errors = this.toUnknownArray(record.errors);
    if (errors && errors.length > 0) {
      const first = errors[0];
      if (first && typeof first === 'object') {
        const err = first as Record<string, unknown>;
        const errCode = typeof err.code === 'string' ? err.code : undefined;
        const errMessage =
          typeof err.message === 'string' ? err.message : undefined;
        if (errCode) summary.error_code = errCode;
        if (errMessage) summary.error_message = errMessage;
      }
    }

    return Object.keys(summary).length > 0 ? summary : undefined;
  }

  private toUnknownArray(value: unknown): unknown[] | undefined {
    return Array.isArray(value) ? (value as unknown[]) : undefined;
  }

  private pickFirstString(
    source: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
    return undefined;
  }
}
