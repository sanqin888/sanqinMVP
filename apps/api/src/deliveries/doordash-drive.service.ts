// apps/api/src/deliveries/doordash-drive.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, isAxiosError } from 'axios';
import * as jwt from 'jsonwebtoken';
import type { JwtHeader, SignOptions } from 'jsonwebtoken';

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
  orderId: string;
  pickupCode?: string | null;
  reference?: string | null;
  totalCents: number;
  items: DoorDashManifestItem[];
  destination: DoorDashDropoffDetails;
}

/**
 * DoorDash Drive 标准化后的返回结果：
 * - deliveryId: DoorDash 的 delivery id / external_delivery_id
 * - status / trackingUrl: 可选
 * - deliveryCostCents: 我们付给 DoorDash 的配送成本（单位：分），如果能解析到就带上
 */
export interface DoorDashDeliveryResult {
  deliveryId: string;
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

const splitName = (raw: string | undefined) => {
  const value = trimToUndefined(raw);
  if (!value) return { first: undefined, last: undefined };
  const parts = value.split(/\s+/);
  const first = parts.shift();
  const last = parts.length > 0 ? parts.join(' ') : undefined;
  return { first, last };
};

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

    // DoorDash 的取餐地址：优先用 DOORDASH_*，否则回退到 UBER_DIRECT_*
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

    const instructions =
      trimToUndefined(process.env.DOORDASH_STORE_INSTRUCTIONS) ??
      trimToUndefined(process.env.UBER_DIRECT_STORE_INSTRUCTIONS);

    const latitude = (() => {
      const raw =
        trimToUndefined(process.env.DOORDASH_STORE_LATITUDE) ??
        trimToUndefined(process.env.UBER_DIRECT_STORE_LATITUDE);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : undefined;
    })();

    const longitude = (() => {
      const raw =
        trimToUndefined(process.env.DOORDASH_STORE_LONGITUDE) ??
        trimToUndefined(process.env.UBER_DIRECT_STORE_LONGITUDE);
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : undefined;
    })();

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
      instructions,
      latitude,
      longitude,
    };
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
    if (!this.pickup.phone) {
      throw new Error('DoorDash store phone is required');
    }
    if (
      !this.pickup.addressLine1 ||
      !this.pickup.city ||
      !this.pickup.province ||
      !this.pickup.postalCode
    ) {
      throw new Error('DoorDash store address fields are incomplete');
    }
  }

  /** 按 DoorDash 文档生成 JWT：HS256 + header.dd-ver = 'DD-JWT-V1' */
  private buildJwt(): string {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      aud: 'doordash',
      iss: this.tokenConfig.developerId,
      kid: this.tokenConfig.keyId,
      exp: now + 5 * 60,
      iat: now,
    };

    // 扩展 JwtHeader，加一个任意 key 的索引签名，这样 'dd-ver' 不会报错
    const header: JwtHeader & { [key: string]: unknown } = {
      alg: 'HS256',
      typ: 'JWT',
      'dd-ver': 'DD-JWT-V1',
    };

    const options: SignOptions = {
      algorithm: 'HS256',
      header,
    };

    return jwt.sign(payload, this.tokenConfig.signingSecret, options);
  }

  private formatAddress(parts: Array<string | undefined>): string {
    return parts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter((part) => part.length > 0)
      .join(', ');
  }

  /** 创建配送订单：订单确认后调用 */
  async createDelivery(
    options: DoorDashDeliveryOptions,
  ): Promise<DoorDashDeliveryResult> {
    this.ensureConfigured();

    const url = `${this.apiBase}/drive/v2/deliveries`;

    const destination = options.destination;

    const pickupAddress = this.formatAddress([
      this.pickup.addressLine1,
      this.pickup.addressLine2,
      this.pickup.city,
      this.pickup.province,
      this.pickup.postalCode,
      this.pickup.country,
    ]);

    const dropoffAddress = this.formatAddress([
      destination.addressLine1,
      destination.addressLine2,
      destination.city,
      destination.province,
      destination.postalCode,
      destination.country ?? 'Canada',
    ]);

    const reference =
      trimToUndefined(options.reference) ??
      trimToUndefined(options.pickupCode ?? undefined) ??
      options.orderId;

    const itemsPayload = options.items
      .map((item) =>
        compact({
          name: trimToUndefined(item.name),
          quantity: item.quantity,
          price:
            typeof item.priceCents === 'number'
              ? Math.round(item.priceCents)
              : undefined,
        }),
      )
      .filter((entry) => Boolean(entry.name) && Number(entry.quantity) > 0);

    const pickupNames = splitName(
      this.pickup.contactName ?? this.pickup.businessName,
    );
    const dropoffNames = splitName(destination.name);

    const body = compact({
      external_delivery_id: options.orderId,
      pickup_address: pickupAddress,
      pickup_business_name: this.pickup.businessName,
      pickup_phone_number: this.pickup.phone,
      pickup_instructions: this.pickup.instructions,
      pickup_reference_tag: reference,

      dropoff_address: dropoffAddress,
      dropoff_business_name: trimToUndefined(destination.company),
      dropoff_phone_number: destination.phone,

      order_value: Math.max(0, Math.round(options.totalCents)),
      tip:
        typeof destination.tipCents === 'number'
          ? Math.max(0, Math.round(destination.tipCents))
          : 0,

      contactless_dropoff: true,
      action_if_undeliverable: 'return_to_pickup',

      items: itemsPayload.length > 0 ? itemsPayload : undefined,

      pickup: compact({
        contact: compact({
          first_name: pickupNames.first ?? this.pickup.businessName,
          last_name: pickupNames.last,
          phone: this.pickup.phone,
          company_name: this.pickup.businessName,
        }),
        location: compact({
          address: pickupAddress,
          address_line1: this.pickup.addressLine1,
          address_line2: this.pickup.addressLine2,
          city: this.pickup.city,
          state: this.pickup.province,
          postal_code: this.pickup.postalCode,
          country: this.pickup.country,
          latitude: this.pickup.latitude,
          longitude: this.pickup.longitude,
        }),
      }),

      dropoff: compact({
        contact: compact({
          first_name: dropoffNames.first,
          last_name: dropoffNames.last,
          phone: destination.phone,
          company_name: trimToUndefined(destination.company),
        }),
        location: compact({
          address: dropoffAddress,
          address_line1: destination.addressLine1,
          address_line2: destination.addressLine2,
          city: destination.city,
          state: destination.province,
          postal_code: destination.postalCode,
          country: destination.country ?? 'Canada',
          latitude: destination.latitude,
          longitude: destination.longitude,
        }),
        instructions:
          trimToUndefined(destination.instructions) ??
          trimToUndefined(destination.notes),
      }),
    });

    // 只在 DEBUG_DOORDASH_DRIVE=1 时打印 payload
    if (process.env.DEBUG_DOORDASH_DRIVE === '1') {
      try {
        this.logger.debug(
          `[DoorDashDriveService] Creating delivery order=${options.orderId} url=${url} payload=${JSON.stringify(
            body,
          )}`,
        );
      } catch {
        this.logger.debug(
          `[DoorDashDriveService] Failed to stringify DoorDash payload for logging`,
        );
      }
    }

    try {
      const { data } = await this.http.axiosRef.post<Record<string, unknown>>(
        url,
        body,
        {
          headers: {
            Authorization: `Bearer ${this.buildJwt()}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 20000,
        },
      );

      return this.normalizeResponse(data);
    } catch (error) {
      this.logger.error(
        `[DoorDashDriveService] Failed to create DoorDash delivery for order=${options.orderId}`,
      );
      throw this.wrapDoorDashError(error);
    }
  }

  private normalizeResponse(payload: unknown): DoorDashDeliveryResult {
    if (!payload || typeof payload !== 'object') {
      throw new Error('DoorDash response is not an object');
    }
    const body = payload as Record<string, unknown>;

    const deliveryId = this.pickFirstString(body, [
      'delivery_id',
      'id',
      'uuid',
      'external_delivery_id',
      'tracking_id',
    ]);
    if (!deliveryId) {
      throw new Error('DoorDash response missing delivery id');
    }

    const status = this.pickFirstString(body, ['status', 'state']);
    const trackingUrl = this.pickFirstString(body, [
      'tracking_url',
      'tracking_url_web',
    ]);

    const deliveryCostCents =
      this.pickFirstNumber(body, [
        'delivery_fee_cents',
        'delivery_fee',
        'fee',
        'courier_fee',
        'total_fee_cents',
        'total_fee',
      ]) ?? undefined;

    return { deliveryId, status, trackingUrl, deliveryCostCents };
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

  private pickFirstNumber(
    source: Record<string, unknown>,
    keys: string[],
  ): number | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value);
      }
      if (typeof value === 'string') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) {
          return Math.round(parsed);
        }
      }
    }
    return undefined;
  }

  private wrapDoorDashError(error: unknown): Error {
    if (isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const baseData: unknown = axiosError.response?.data;

      let bodySnippet = '[no response body]';
      if (typeof baseData !== 'undefined') {
        try {
          bodySnippet = JSON.stringify(baseData);
        } catch {
          bodySnippet = '[unserializable response body]';
        }
      }

      // 尝试从 response body 里提取 message（类型安全，无 any）
      let messageFromBody: string | undefined;
      if (baseData && typeof baseData === 'object' && 'message' in baseData) {
        const withMessage = baseData as { message?: unknown };
        if (typeof withMessage.message === 'string') {
          messageFromBody = withMessage.message;
        }
      }

      const fallbackMessage =
        typeof axiosError.message === 'string'
          ? axiosError.message
          : 'DoorDash API error';

      const message = messageFromBody ?? fallbackMessage;

      this.logger.error(
        `[DoorDashDriveService] DoorDash API error${
          status ? ` (${status})` : ''
        }: ${message}; response body=${bodySnippet}`,
        axiosError.stack,
      );

      return new Error(
        `DoorDash API error${status ? ` (${status})` : ''}: ${message}`,
      );
    }

    if (error instanceof Error) {
      this.logger.error(
        `[DoorDashDriveService] Non-Axios error while calling DoorDash: ${error.message}`,
        error.stack,
      );
      return error;
    }

    const fallback = String(error);
    this.logger.error(
      `[DoorDashDriveService] Unknown error type while calling DoorDash: ${fallback}`,
    );
    return new Error(fallback);
  }
}