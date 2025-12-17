import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';

interface UberDirectOAuthResponse {
  access_token?: string;
  expires_in?: number | string;
}

type UberDirectApiResponse = Record<string, unknown>;

type AxiosErrorLike = {
  isAxiosError?: boolean;
  response?: {
    status?: number;
    data?: unknown;
  };
  message?: string;
  stack?: string;
};

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

export interface UberDirectManifestItem {
  name: string;
  quantity: number;
  priceCents?: number | null;
}

export interface UberDirectDeliveryOptions {
  orderId: string;
  pickupCode?: string | null;
  reference?: string | null;
  totalCents: number;
  items: UberDirectManifestItem[];
  destination: UberDirectDropoffDetails;
}

/**
 * Uber Direct API 标准化后的返回结果：
 * - deliveryId: 必填，唯一标识这单配送
 * - status / trackingUrl: 可选
 * - deliveryCostCents: 我们实际要付给 Uber 的配送成本（单位：分），如果能从响应里解析到就带上
 */
export interface UberDirectDeliveryResult {
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

interface TokenCache {
  value: string;
  expiresAt: number;
}

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOptionalNumber = (value: string | undefined): number | undefined => {
  if (typeof value === 'undefined') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

const splitName = (raw: string | undefined) => {
  const value = trimToUndefined(raw);
  if (!value) return { first: undefined, last: undefined };
  const parts = value.split(/\s+/);
  const first = parts.shift();
  const last = parts.length > 0 ? parts.join(' ') : undefined;
  return { first, last };
};

@Injectable()
export class UberDirectService {
  private readonly logger = new Logger(UberDirectService.name);

  private readonly apiBase: string;
  private readonly customerId: string;
  private readonly authScheme: string;
  private readonly serverToken: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly oauthScope: string;
  private readonly oauthTokenUrl: string;
  private readonly currency: string;
  private readonly requestTimeoutMs: number;
  private readonly pickupReadyMinutes: number;
  private readonly pickupDeadlineMinutes: number;
  private readonly dropoffReadyMinutes: number;
  private readonly dropoffDeadlineMinutes: number;
  private readonly pickup: PickupConfig;
  private tokenCache?: TokenCache;

  constructor(private readonly http: HttpService) {
    this.apiBase = (
      process.env.UBER_DIRECT_API_BASE ?? 'https://api.uber.com'
    ).replace(/\/+$/, '');
    this.customerId =
      trimToUndefined(process.env.UBER_DIRECT_CUSTOMER_ID) ?? '';
    this.serverToken =
      trimToUndefined(process.env.UBER_DIRECT_SERVER_TOKEN) ?? '';
    this.clientId = trimToUndefined(process.env.UBER_DIRECT_CLIENT_ID) ?? '';
    this.clientSecret =
      trimToUndefined(process.env.UBER_DIRECT_CLIENT_SECRET) ?? '';
    this.oauthScope =
      trimToUndefined(process.env.UBER_DIRECT_OAUTH_SCOPE) ?? 'eats.deliveries';
    this.oauthTokenUrl =
      trimToUndefined(process.env.UBER_DIRECT_OAUTH_URL) ??
      'https://login.uber.com/oauth/v2/token';
    this.authScheme =
      trimToUndefined(process.env.UBER_DIRECT_AUTH_SCHEME) ??
      (this.serverToken ? 'Token' : 'Bearer');
    this.currency = trimToUndefined(process.env.UBER_DIRECT_CURRENCY) ?? 'CAD';
    this.requestTimeoutMs = parseNumber(
      process.env.UBER_DIRECT_TIMEOUT_MS,
      20000,
    );
    this.pickupReadyMinutes = parseNumber(
      process.env.UBER_DIRECT_PICKUP_READY_MINUTES,
      10,
    );
    this.pickupDeadlineMinutes = parseNumber(
      process.env.UBER_DIRECT_PICKUP_DEADLINE_MINUTES,
      25,
    );
    this.dropoffReadyMinutes = parseNumber(
      process.env.UBER_DIRECT_DROPOFF_READY_MINUTES,
      30,
    );
    this.dropoffDeadlineMinutes = parseNumber(
      process.env.UBER_DIRECT_DROPOFF_DEADLINE_MINUTES,
      60,
    );

    this.pickup = {
      businessName:
        trimToUndefined(process.env.UBER_DIRECT_STORE_BUSINESS_NAME) ??
        'San Qin Cafe',
      contactName: trimToUndefined(process.env.UBER_DIRECT_STORE_CONTACT),
      phone: trimToUndefined(process.env.UBER_DIRECT_STORE_PHONE) ?? '',
      addressLine1:
        trimToUndefined(process.env.UBER_DIRECT_STORE_ADDRESS_LINE1) ?? '',
      addressLine2: trimToUndefined(
        process.env.UBER_DIRECT_STORE_ADDRESS_LINE2,
      ),
      city: trimToUndefined(process.env.UBER_DIRECT_STORE_CITY) ?? '',
      province: trimToUndefined(process.env.UBER_DIRECT_STORE_PROVINCE) ?? '',
      postalCode:
        trimToUndefined(process.env.UBER_DIRECT_STORE_POSTAL_CODE) ?? '',
      country:
        trimToUndefined(process.env.UBER_DIRECT_STORE_COUNTRY) ?? 'Canada',
      instructions: trimToUndefined(process.env.UBER_DIRECT_STORE_INSTRUCTIONS),
      latitude: parseOptionalNumber(process.env.UBER_DIRECT_STORE_LATITUDE),
      longitude: parseOptionalNumber(process.env.UBER_DIRECT_STORE_LONGITUDE),
    };
  }

  async createDelivery(
    options: UberDirectDeliveryOptions,
  ): Promise<UberDirectDeliveryResult> {
    this.ensureConfigured();

    const url = `${this.apiBase}/v1/customers/${encodeURIComponent(
      this.customerId,
    )}/deliveries`;
    const payload = this.buildPayload(options);

    // 仅在需要调试时打印 payload，默认不打
    if (process.env.DEBUG_UBER_DIRECT === '1') {
      try {
        this.logger.debug(
          `[UberDirectService] Creating Uber Direct delivery. order=${options.orderId}, url=${url}, payload=${JSON.stringify(
            payload,
          )}`,
        );
      } catch {
        this.logger.debug(
          `[UberDirectService] Failed to stringify Uber Direct payload for logging`,
        );
      }
    }

    try {
      const response = await this.http.axiosRef.post<UberDirectApiResponse>(
        url,
        payload,
        {
          headers: {
            Authorization: await this.buildAuthHeader(),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: this.requestTimeoutMs,
        },
      );

      const normalized = this.normalizeResponse(response.data);

      return normalized;
    } catch (error: unknown) {
      this.logger.error(
        `[UberDirectService] Failed to create Uber Direct delivery for order=${options.orderId}`,
      );
      throw this.wrapUberError(error);
    }
  }

  private ensureConfigured(): void {
    if (!this.customerId) {
      throw new Error('UBER_DIRECT_CUSTOMER_ID is not configured');
    }
    if (!this.pickup.phone) {
      throw new Error('UBER_DIRECT_STORE_PHONE is required');
    }
    if (
      !this.pickup.addressLine1 ||
      !this.pickup.city ||
      !this.pickup.province ||
      !this.pickup.postalCode
    ) {
      throw new Error('UBER_DIRECT_STORE_ADDRESS_* fields are incomplete');
    }
    if (!this.serverToken && (!this.clientId || !this.clientSecret)) {
      throw new Error('Uber Direct credentials are missing');
    }
  }

  private async buildAuthHeader(): Promise<string> {
    if (this.serverToken) {
      return `${this.authScheme} ${this.serverToken}`;
    }
    const token = await this.fetchOAuthToken();
    return `${this.authScheme} ${token}`;
  }

  private async fetchOAuthToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.value;
    }
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Uber Direct OAuth client is not configured');
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: this.oauthScope,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const { data } = await this.http.axiosRef.post<UberDirectOAuthResponse>(
      this.oauthTokenUrl,
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: this.requestTimeoutMs,
      },
    );

    const token =
      typeof data?.access_token === 'string' ? data.access_token : '';
    if (!token) {
      throw new Error('Uber Direct OAuth response missing access_token');
    }
    const expiresIn = Number(data?.expires_in ?? 3600);
    const ttlMs = Math.max(60, expiresIn - 30) * 1000;
    this.tokenCache = { value: token, expiresAt: Date.now() + ttlMs };
    return token;
  }

  private buildPayload(
    options: UberDirectDeliveryOptions,
  ): Record<string, unknown> {
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

    const manifestItems = this.buildManifestItems(options.items);
    const pickupNames = splitName(
      this.pickup.contactName ?? this.pickup.businessName,
    );
    const dropoffNames = splitName(destination.name);

    const payload = compact({
      external_delivery_id: options.orderId,
      manifest_reference: reference,
      pickup_name: this.pickup.contactName ?? this.pickup.businessName,
      pickup_business_name: this.pickup.businessName,
      pickup_address: pickupAddress,
      pickup_phone_number: this.pickup.phone,
      pickup_instructions: this.pickup.instructions,
      pickup_latitude: this.pickup.latitude,
      pickup_longitude: this.pickup.longitude,
      dropoff_name: destination.name,
      dropoff_business_name: trimToUndefined(destination.company),
      dropoff_address: dropoffAddress,
      dropoff_phone_number: destination.phone,
      dropoff_instructions:
        trimToUndefined(destination.instructions) ??
        trimToUndefined(destination.notes),
      dropoff_latitude: destination.latitude,
      dropoff_longitude: destination.longitude,
      manifest_items: manifestItems.length > 0 ? manifestItems : undefined,
      manifest_total_value: Math.max(0, Math.round(options.totalCents)),
      manifest_currency_code: this.currency,
      tip:
        typeof destination.tipCents === 'number'
          ? Math.max(0, destination.tipCents)
          : undefined,
      pickup_ready: this.isoFromNow(this.pickupReadyMinutes),
      pickup_deadline: this.isoFromNow(this.pickupDeadlineMinutes),
      dropoff_ready: this.isoFromNow(this.dropoffReadyMinutes),
      dropoff_deadline: this.isoFromNow(this.dropoffDeadlineMinutes),
    });

    payload.pickup = compact({
      instructions: this.pickup.instructions,
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
    });

    payload.dropoff = compact({
      instructions:
        trimToUndefined(destination.instructions) ??
        trimToUndefined(destination.notes),
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
    });

    return payload;
  }

  private buildManifestItems(
    items: UberDirectManifestItem[],
  ): Array<Record<string, unknown>> {
    return items
      .map((item) => ({
        name: trimToUndefined(item.name),
        quantity: item.quantity,
        price:
          typeof item.priceCents === 'number'
            ? Math.round(item.priceCents)
            : undefined,
      }))
      .filter((entry) => Boolean(entry.name) && Number(entry.quantity) > 0)
      .map((entry) => compact(entry));
  }

  private normalizeResponse(payload: unknown): UberDirectDeliveryResult {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Uber Direct response is not an object');
    }
    const record = payload as Record<string, unknown>;
    const body =
      record.data && typeof record.data === 'object'
        ? (record.data as Record<string, unknown>)
        : record;

    const deliveryId = this.pickFirstString(body, [
      'delivery_id',
      'id',
      'uuid',
      'tracking_id',
      'external_delivery_id',
    ]);
    if (!deliveryId) {
      throw new Error('Uber Direct response missing delivery id');
    }

    const status = this.pickFirstString(body, ['status', 'state']);
    const trackingUrl = this.pickFirstString(body, [
      'tracking_url',
      'tracking_url_v2',
      'tracking_url_web',
    ]);

    // ⭐️ 这里从响应里解析“我们付给 Uber 的配送费（单位：分）”
    // 实际字段名取决于 Uber API 返回，可以按需要再补 key
    const deliveryCostCents =
      this.pickFirstNumber(body, [
        'delivery_fee_cents',
        'delivery_fee',
        'fee',
        'courier_fee',
        'total_fee_cents',
        'total_fee',
      ]) ??
      (body.quote && typeof body.quote === 'object'
        ? this.pickFirstNumber(body.quote as Record<string, unknown>, [
            'delivery_fee_cents',
            'delivery_fee',
            'total',
            'total_cents',
          ])
        : undefined);

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

  private isoFromNow(minutes: number): string {
    const ms = Math.max(0, minutes) * 60 * 1000;
    return new Date(Date.now() + ms).toISOString();
  }

  private formatAddress(parts: Array<string | undefined>): string {
    return parts
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter((part) => part.length > 0)
      .join(', ');
  }

  private isAxiosErrorLike(error: unknown): error is AxiosErrorLike {
    return (
      typeof error === 'object' &&
      error !== null &&
      'isAxiosError' in error &&
      (error as { isAxiosError?: boolean }).isAxiosError === true
    );
  }

  private formatUnknownError(value: unknown): string {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable error]';
    }
  }

  private wrapUberError(error: unknown): Error {
    if (this.isAxiosErrorLike(error)) {
      const axiosError: AxiosErrorLike = error;
      const status =
        axiosError.response && typeof axiosError.response.status === 'number'
          ? axiosError.response.status
          : undefined;
      const baseData: unknown = axiosError.response?.data;

      let bodySnippet = '[no response body]';
      if (typeof baseData !== 'undefined') {
        try {
          bodySnippet = JSON.stringify(baseData);
        } catch {
          bodySnippet = '[unserializable response body]';
        }
      }

      const uberMessage = this.extractUberMessage(baseData);
      const message = uberMessage ?? axiosError.message ?? '[no error message]';
      const stack =
        typeof axiosError.stack === 'string' ? axiosError.stack : undefined;

      this.logger.error(
        `[UberDirectService] Uber Direct API error${
          status ? ` (${status})` : ''
        }: ${message}; response body=${bodySnippet}`,
        stack,
      );

      return new Error(
        `Uber Direct API error${status ? ` (${status})` : ''}: ${message}`,
      );
    }

    if (error instanceof Error) {
      this.logger.error(
        `[UberDirectService] Non-Axios error while calling Uber Direct: ${error.message}`,
        error.stack,
      );
      return error;
    }

    const formatted = this.formatUnknownError(error);
    this.logger.error(
      `[UberDirectService] Unknown error type while calling Uber Direct: ${formatted}`,
    );
    return new Error(formatted);
  }

  private extractUberMessage(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.description === 'string') return record.description;
    const errors: unknown[] | undefined = Array.isArray(record.errors)
      ? record.errors
      : undefined;
    if (errors && errors.length > 0) {
      const [first] = errors;
      if (first && typeof first === 'object') {
        const err = first as Record<string, unknown>;
        const code = typeof err.code === 'string' ? err.code : undefined;
        const message =
          typeof err.message === 'string' ? err.message : undefined;
        if (code && message) return `${code}: ${message}`;
        return message ?? code;
      }
    }
    return undefined;
  }
}
