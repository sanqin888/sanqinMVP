//apps/api/src/integrations/ubereats/ubereats.service.ts
import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  NotImplementedException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Channel,
  FulfillmentType,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { UberAuthService } from './uber-auth.service';
import { UberWebhookEnvelopeDto } from './dto/uber-webhook-envelope.dto';
import { UberMenuNotificationDto } from './dto/uber-menu-notification.dto';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import {
  OrderIngestionService,
  NormalizedOrderItem,
} from '../../orders/order-ingestion.service';

class UberWebhookNonRetryableError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'UberWebhookNonRetryableError';
  }
}

type UberWebhookInput = {
  headers: Record<string, unknown>;
  /** @deprecated The service always parses the signed rawBody instead. */
  body?: unknown;
  rawBody: string | Buffer;
};

type UberMenuPublishError = {
  code: string;
  path: string | null;
  message: string;
  entityType?: 'item' | 'category' | 'modifier';
  localId?: string;
};

type UberOrderMoneyDto = number | { amount?: number; value?: number };

type UberOrderItemPriceDto =
  | UberOrderMoneyDto
  | {
      unit_price?: UberOrderMoneyDto;
      total_price?: UberOrderMoneyDto;
    };

type UberOrderModifierDto = {
  id?: string;
  modifier_id?: string;
  title?: string;
  name?: string;
  quantity?: number;
  price?: UberOrderMoneyDto;
  price_delta?: UberOrderMoneyDto;
  special_instructions?: string;
  modifiers?: UberOrderModifierDto[];
  selected_items?: UberOrderModifierDto[];
};

type UberOrderItemDto = {
  id?: string;
  instance_id?: string;
  line_item_id?: string;
  item_id?: string;
  external_data?: string;
  title?: string;
  name?: string;
  quantity?: number;
  price?: UberOrderItemPriceDto;
  unit_price?: UberOrderMoneyDto;
  total_price?: UberOrderMoneyDto;
  special_instructions?: string;
  modifiers?: UberOrderModifierDto[];
  selected_modifier_groups?: Array<{
    id?: string;
    title?: string;
    selected_items?: UberOrderModifierDto[];
  }>;
};

type UberOrderDetailDto = {
  id?: string;
  order_id?: string;
  external_order_id?: string;
  display_id?: string;
  pickup_code?: string;
  store_id?: string;
  store?: {
    id?: string;
  };
  subtotal?: UberOrderMoneyDto;
  sub_total?: UberOrderMoneyDto;
  subtotal_cents?: number;
  tax?: UberOrderMoneyDto;
  tax_cents?: number;
  total?: UberOrderMoneyDto;
  total_cents?: number;
  discount?: UberOrderMoneyDto;
  discount_cents?: number;
  discountCents?: number;
  delivery_fee?: UberOrderMoneyDto;
  payment?: {
    charges?: {
      total?: UberOrderMoneyDto;
      sub_total?: UberOrderMoneyDto;
      subtotal?: UberOrderMoneyDto;
      tax?: UberOrderMoneyDto;
      delivery_fee?: UberOrderMoneyDto;
      total_fee?: UberOrderMoneyDto;
      total_promo_applied?: UberOrderMoneyDto;
      sub_total_promo_applied?: UberOrderMoneyDto;
      tax_promo_applied?: UberOrderMoneyDto;
    };
    promotions?: {
      promotions?: Array<{
        promo_discount_value?: number;
        promo_delivery_fee_value?: number;
      }>;
    } | null;
  };
  items?: UberOrderItemDto[];
  cart?: { items?: UberOrderItemDto[]; special_instructions?: string };
  customer?: {
    name?: string;
    full_name?: string;
    phone?: string;
    phone_number?: string;
  };
  eater?: {
    first_name?: string;
    last_name?: string;
    name?: string;
    full_name?: string;
    phone?: string;
    phone_number?: string;
  };
  fulfillment_type?: string;
  type?: string;
  estimated_ready_for_pickup_at?: string;
  estimated_delivery_at?: string;
  special_instructions?: string;
  paid_at?: string;
  created_at?: string;
  placed_at?: string;
  cancelled_at?: string;
  canceled_at?: string;
  cancellation?: {
    cancelled_by?: string;
    canceled_by?: string;
    reason?: string;
    reason_code?: string;
    details?: string;
  };
};

type ParsedUberModifier = {
  externalId: string | null;
  parentExternalId: string | null;
  displayName: string;
  quantity: number;
  priceDeltaCents: number;
  specialInstructions: string | null;
  children: ParsedUberModifier[];
};

type ParsedUberOrderItem = {
  externalLineId: string | null;
  externalItemId: string | null;
  stableIdHint: string | null;
  displayName: string;
  quantity: number;
  baseUnitPriceCents: number;
  optionsUnitPriceCents: number;
  unitPriceCents: number;
  lineTotalCents: number;
  specialInstructions: string | null;
  modifiers: ParsedUberModifier[];
};

type ParsedUberOrder = {
  externalOrderId: string;
  displayId: string | null;
  pickupCode: string | null;
  storeId?: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  discountCents: number;
  hasPromotion: boolean;
  deliveryFeeCents: number;
  fulfillmentType: 'pickup' | 'delivery';
  estimatedReadyAt: Date | null;
  specialInstructions: string | null;
  items: ParsedUberOrderItem[];
  contactName?: string | null;
  contactPhone?: string | null;
  paidAt: Date;
  cancellation: {
    cancelledBy: string | null;
    reasonCode: string | null;
    reasonDetail: string | null;
    occurredAt: Date;
  } | null;
};

type UberAuthenticationError = {
  upstreamStatus: number;
  code: string;
  message: string;
};

type UberStoreScopedInput = {
  storeId?: string;
};

type UpsertPriceBookItemInput = UberStoreScopedInput & {
  menuItemStableId: string;
  priceCents: number;
  isAvailable?: boolean;
  displayName?: string;
  displayDescription?: string;
};

type UpsertOptionItemConfigInput = UberStoreScopedInput & {
  optionChoiceStableId: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  displayName?: string;
  displayDescription?: string;
};

type UpdateDraftItemInput = UberStoreScopedInput & {
  displayName?: string;
  displayDescription?: string;
  priceCents?: number;
  isAvailable?: boolean;
  sortOrder?: number;
};

type UpdateDraftGroupInput = UberStoreScopedInput & {
  name?: string;
  minSelect?: number;
  maxSelect?: number;
  required?: boolean;
  sortOrder?: number;
};

type UpdateDraftOptionInput = UberStoreScopedInput & {
  displayName?: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  sortOrder?: number;
};

type PublishMenuInput = UberStoreScopedInput & {
  dryRun?: boolean;
  timezoneConfirmed?: boolean;
  taxRateConfirmed?: boolean;
  excludedCategoryIds?: string[];
  excludedGroupIds?: string[];
  excludedMenuItemStableIds?: string[];
  excludedOptionChoiceStableIds?: string[];
};

type UberCategoryEntityRef = {
  id: string;
  type: 'ITEM';
};

type UberModifierOptionRef = {
  id: string;
  type: 'ITEM';
};

type UberMenuUploadPayload = {
  menus: Array<{
    id: string;
    title: { translations: { en_us: string } };
    category_ids: string[];
    service_availability: UberServiceAvailability[];
  }>;
  categories: Array<{
    id: string;
    title: { translations: { en_us: string } };
    entities: UberCategoryEntityRef[];
  }>;
  items: Array<{
    id: string;
    title: { translations: { en_us: string } };
    description?: { translations: { en_us: string } };
    price_info: { price: number; overrides: [] };
    tax_info: { tax_rate: number; vat_rate_percentage: null };
    modifier_group_ids: { ids: string[] | null; overrides: [] };
    suspension_info: null | {
      suspension: { suspend_until: number; reason: string };
    };
    image_url?: string;
  }>;
  modifier_groups: Array<{
    id: string;
    title: { translations: { en_us: string } };
    quantity_info: {
      quantity: { min_permitted: number; max_permitted: number };
    };
    modifier_options: UberModifierOptionRef[];
  }>;
};

export type LocalBusinessHour = {
  weekday: number;
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
};

export type UberServiceAvailability = {
  day_of_week: string;
  time_periods: Array<{ start_time: string; end_time: string }>;
};

const UBER_WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

/** Convert recurring store-local hours without applying the server/UTC clock. */
export function toUberServiceAvailability(
  hours: LocalBusinessHour[],
  timezone: string,
): UberServiceAvailability[] {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException(`门店时区无效：${timezone}`);
  }

  const periods = Array.from(
    { length: 7 },
    () =>
      [] as Array<{
        start_time: string;
        end_time: string;
      }>,
  );
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  for (const hour of hours) {
    if (hour.isClosed) continue;
    if (
      !Number.isInteger(hour.weekday) ||
      hour.weekday < 0 ||
      hour.weekday > 6 ||
      hour.openMinutes === null ||
      hour.closeMinutes === null ||
      !Number.isInteger(hour.openMinutes) ||
      !Number.isInteger(hour.closeMinutes) ||
      hour.openMinutes < 0 ||
      hour.openMinutes > 1439 ||
      hour.closeMinutes < 0 ||
      hour.closeMinutes > 1440
    )
      continue;

    const start = hour.openMinutes;
    const end = hour.closeMinutes;
    // Uber uses 24:00 as the exclusive end of a local day. 23:59 would leave
    // a one-minute gap in split and full-day ranges.
    if (start === end || (start === 0 && end === 1440)) {
      periods[hour.weekday].push({ start_time: '00:00', end_time: '24:00' });
    } else if (start < end) {
      periods[hour.weekday].push({
        start_time: format(start),
        end_time: end === 1440 ? '24:00' : format(end),
      });
    } else {
      periods[hour.weekday].push({
        start_time: format(start),
        end_time: '24:00',
      });
      periods[(hour.weekday + 1) % 7].push({
        start_time: '00:00',
        end_time: format(end),
      });
    }
  }

  return periods.flatMap((time_periods, weekday) =>
    time_periods.length
      ? [{ day_of_week: UBER_WEEKDAYS[weekday].toLowerCase(), time_periods }]
      : [],
  );
}

type UberMenuGraphValidationIssue = {
  code: string;
  message: string;
  severity?: 'ERROR' | 'WARNING';
  path?: string;
  sourceStableId?: string;
  itemId?: string;
  itemStableId?: string;
  groupId?: string;
  groupStableId?: string;
  optionItemId?: string;
};

export type UberMenuPayloadValidationIssue = {
  code: string;
  severity: 'ERROR' | 'WARNING';
  path: string;
  sourceStableId: string | null;
  message: string;
};

const UBER_IMAGE_URL_MAX_LENGTH = 2_000;
const UBER_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const UBER_ITEM_DESCRIPTION_MAX_LENGTH = 300;
const EXPIRING_IMAGE_QUERY_KEYS = new Set([
  'expires',
  'x-amz-expires',
  'x-amz-signature',
  'signature',
  'token',
]);

function isPermanentPublicHttpsUrl(value: string): boolean {
  if (!value || value.length > UBER_IMAGE_URL_MAX_LENGTH) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:')
    )
      return false;
    const octets = hostname.split('.').map(Number);
    if (
      octets.length === 4 &&
      octets.every(
        (part) => Number.isInteger(part) && part >= 0 && part <= 255,
      ) &&
      (octets[0] === 10 ||
        octets[0] === 127 ||
        octets[0] === 0 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168))
    )
      return false;
    return !Array.from(url.searchParams.keys()).some((key) =>
      EXPIRING_IMAGE_QUERY_KEYS.has(key.toLowerCase()),
    );
  } catch {
    return false;
  }
}

/** Convert the site's stored image path into the public URL Uber can fetch. */
export function resolveUberImageUrl(value: string | null): string | null {
  const imageUrl = value?.trim();
  if (!imageUrl) return null;
  if (!imageUrl.startsWith('/')) return imageUrl;

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.WEB_BASE_URL?.trim() ||
    'https://sanq.ca';
  try {
    return new URL(imageUrl, publicBaseUrl).toString();
  } catch {
    // Keep the invalid value so payload validation blocks the publish instead
    // of silently dropping the image from the menu.
    return imageUrl;
  }
}

type SyncAvailabilityInput = UberStoreScopedInput & {
  menuItemStableId: string;
  isAvailable: boolean;
};

export type UberAvailabilitySyncStatus =
  | 'SYNCED'
  | 'PENDING'
  | 'SKIPPED_NOT_PUBLISHED'
  | 'FAILED';

export type UberAvailabilitySyncResult = {
  status: UberAvailabilitySyncStatus;
  stores: Array<{
    storeId: string;
    uberStoreId: string | null;
    status: UberAvailabilitySyncStatus;
    versionStableId?: string;
    error?: string;
  }>;
};

type SyncOptionAvailabilityInput = UberStoreScopedInput & {
  optionChoiceStableId: string;
  isAvailable: boolean;
};

type GenerateReconciliationReportInput = UberStoreScopedInput & {
  rangeStart?: string;
  rangeEnd?: string;
};

type UberOrderActionName = 'ACCEPT' | 'DENY' | 'READY_FOR_PICKUP';

const UBER_ACTION_BY_LOCAL_STATUS: Partial<
  Record<OrderStatus, UberOrderActionName>
> = {
  [OrderStatus.ready]: 'READY_FOR_PICKUP',
};

type UberOrderActionRecord = {
  id: string;
  externalOrderId: string;
  action: UberOrderActionName;
  status: string;
  retryable: boolean;
  uberHttpStatus: number | null;
  reasonCode?: string | null;
  reasonDetail?: string | null;
  lastError?: string | null;
};

export type UberOrderActionResult = {
  ok: boolean;
  action: UberOrderActionName;
  actionId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  retryable: boolean;
  duplicate: boolean;
  uberHttpStatus?: number | null;
  errorSummary?: string;
};

type UberDenyReasonCode =
  | 'STORE_CLOSED'
  | 'POS_NOT_READY'
  | 'POS_OFFLINE'
  | 'ITEM_AVAILABILITY'
  | 'MISSING_ITEM'
  | 'MISSING_INFO'
  | 'PRICING'
  | 'CAPACITY'
  | 'ADDRESS'
  | 'SPECIAL_INSTRUCTIONS'
  | 'OTHER';

type UberOrderActionDelegate = {
  findUnique(args: {
    where: {
      externalOrderId_action: {
        externalOrderId: string;
        action: UberOrderActionName;
      };
    };
  }): Promise<UberOrderActionRecord | null>;
  create(args: {
    data: Record<string, unknown>;
  }): Promise<UberOrderActionRecord>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<UberOrderActionRecord>;
  upsert(args: {
    where: {
      externalOrderId_action: {
        externalOrderId: string;
        action: UberOrderActionName;
      };
    };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<UberOrderActionRecord>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { updatedAt: 'asc' | 'desc' };
    take: number;
  }): Promise<UberOrderActionRecord[]>;
};

type UberMerchantStore = {
  storeId: string;
  storeName: string | null;
  locationSummary: string | null;
  integrationEnabled: boolean;
  posExternalStoreId: string | null;
  timezone: string | null;
  raw: Record<string, unknown>;
};

type UberMerchantConnectionRecord = {
  merchantUberUserId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
  connectedAt: Date;
  rawStoresSnapshot?: unknown;
};

type UberStoreMappingRecord = {
  merchantUberUserId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  provisionedAt: Date | null;
  posExternalStoreId: string | null;
  rawPayload?: unknown;
};

type UpsertStoreMappingInput = {
  merchantUberUserId: string;
  uberStoreId: string;
  storeName: string | null;
  locationSummary: string | null;
  isProvisioned: boolean;
  posExternalStoreId: string | null;
  raw: Record<string, unknown>;
};

type UberMerchantConnectionDelegate = {
  findUnique(args: {
    where: { merchantUberUserId: string };
  }): Promise<UberMerchantConnectionRecord | null>;
  findFirst(args: {
    orderBy: { connectedAt: 'desc' | 'asc' };
  }): Promise<UberMerchantConnectionRecord | null>;
  upsert(args: {
    where: { merchantUberUserId: string };
    create: UberMerchantConnectionRecord;
    update: Omit<
      UberMerchantConnectionRecord,
      'merchantUberUserId' | 'rawStoresSnapshot'
    >;
  }): Promise<UberMerchantConnectionRecord>;
  update(args: {
    where: { merchantUberUserId: string };
    data: { rawStoresSnapshot: Record<string, unknown> };
  }): Promise<unknown>;
};

type UberStoreMappingDelegate = {
  findUnique(args: {
    where: { uberStoreId: string };
  }): Promise<UberStoreMappingRecord | null>;
  findMany(args: {
    orderBy: { uberStoreId: 'asc' | 'desc' };
  }): Promise<UberStoreMappingRecord[]>;
  upsert(args: {
    where: { uberStoreId: string };
    create: {
      merchantUberUserId: string;
      uberStoreId: string;
      storeName: string | null;
      locationSummary: string | null;
      isProvisioned: boolean;
      provisionedAt: Date | null;
      posExternalStoreId: string | null;
      rawPayload: Record<string, unknown>;
    };
    update: {
      merchantUberUserId: string;
      storeName: string | null;
      locationSummary: string | null;
      isProvisioned?: boolean;
      provisionedAt?: Date | undefined;
      posExternalStoreId?: string | null;
      rawPayload: Record<string, unknown>;
    };
  }): Promise<UberStoreMappingRecord>;
  updateMany(args: {
    where: { uberStoreId: string };
    data: {
      isProvisioned: boolean;
      provisionedAt: Date | null;
    };
  }): Promise<{ count: number }>;
  update(args: {
    where: { uberStoreId: string };
    data: { posExternalStoreId: string };
  }): Promise<UberStoreMappingRecord>;
};

type CreateOpsTicketInput = UberStoreScopedInput & {
  type: UberOpsTicketType;
  title: string;
  description?: string;
  priority?: UberOpsTicketPriority;
  externalOrderId?: string;
  menuItemStableId?: string;
  context?: Prisma.JsonObject;
};

@Injectable()
export class UberEatsService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberEatsService.name);
  private readonly uberApiBaseUrl =
    process.env.UBER_EATS_API_BASE_URL?.trim() || '';
  private readonly uberResourceHrefAllowedOrigins =
    process.env.UBER_EATS_RESOURCE_HREF_ALLOWED_ORIGINS?.trim() || '';
  private readonly oauthStateSecret: string;
  private readonly webhookSigningKey: string;
  private readonly oauthStateRequests = new Map<
    string,
    {
      adminSessionId: string;
      redirectUri: string;
      createdAt: number;
      merchantContext: string | null;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    @Optional() private readonly orderEventsBus?: OrderEventsBus,
    @Optional() private readonly orderIngestionService?: OrderIngestionService,
  ) {
    const secret = process.env.UBER_EATS_OAUTH_STATE_SECRET?.trim() || '';
    if (secret.length < 32 || new Set(secret).size < 12) {
      throw new Error(
        'UBER_EATS_OAUTH_STATE_SECRET 必须配置为至少 32 个字符的高熵密钥',
      );
    }
    this.oauthStateSecret = secret;

    const webhookSigningKey =
      process.env.UBER_EATS_WEBHOOK_SIGNING_KEY?.trim() || '';
    if (!webhookSigningKey) {
      throw new Error('UBER_EATS_WEBHOOK_SIGNING_KEY 未配置');
    }
    this.webhookSigningKey = webhookSigningKey;
  }

  private get uberMerchantConnectionDelegate(): UberMerchantConnectionDelegate | null {
    const prismaWithUber = this.prisma as PrismaService & {
      uberMerchantConnection?: UberMerchantConnectionDelegate;
    };

    return prismaWithUber.uberMerchantConnection ?? null;
  }

  private get uberStoreMappingDelegate(): UberStoreMappingDelegate | null {
    const prismaWithUber = this.prisma as PrismaService & {
      uberStoreMapping?: UberStoreMappingDelegate;
    };

    return prismaWithUber.uberStoreMapping ?? null;
  }

  private get uberOrderActionDelegate(): UberOrderActionDelegate {
    const delegate = (
      this.prisma as PrismaService & {
        uberOrderAction?: UberOrderActionDelegate;
      }
    ).uberOrderAction;
    if (!delegate) {
      throw new Error('UberOrderAction 数据表不可用');
    }
    return delegate;
  }

  buildMerchantAuthorizeUrl(adminSessionId: string, merchantContext?: string) {
    const state = this.createOAuthState(adminSessionId, merchantContext);
    const authorizeUrl = this.uberAuthService.buildMerchantAuthorizeUrl(state);

    this.logger.log(
      '[ubereats oauth start] stateIssued=true authorizeEndpointReady=true',
    );

    return {
      ok: true,
      state,
      authorizeUrl,
    };
  }

  startMerchantOAuth(adminSessionId: string, merchantContext?: string) {
    return this.buildMerchantAuthorizeUrl(adminSessionId, merchantContext);
  }

  async exchangeAuthorizationCode(
    code: string,
    state: string | undefined,
    adminSessionId: string | undefined,
  ) {
    const stateRequest = this.consumeOAuthState(state, adminSessionId);

    const tokenResult = await this.uberAuthService.exchangeAuthorizationCode(
      code,
      stateRequest.redirectUri,
    );

    this.logger.log('[ubereats oauth] tokenExchangeSucceeded=true');

    const merchantUberUserId = `oauth:${randomUUID()}`;

    const connection = await this.upsertMerchantConnection({
      merchantUberUserId,
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: tokenResult.expiresAt,
      scope: tokenResult.scope,
      tokenType: tokenResult.tokenType,
      connectedAt: new Date(),
      rawStoresSnapshot: null,
    });

    await this.captureEvent('ubereats_merchant_oauth_connected', {
      merchantUberUserId,
      scope: tokenResult.scope ?? '',
      tokenType: tokenResult.tokenType ?? '',
      expiresAt: tokenResult.expiresAt?.toISOString() ?? null,
    });

    return {
      ok: true,
      merchantUberUserId,
      scope: tokenResult.scope,
      tokenType: tokenResult.tokenType,
      expiresAt: tokenResult.expiresAt,
      connectedAt: connection.connectedAt,
    };
  }

  async getMerchantStores(accessToken?: string, merchantUberUserId?: string) {
    const connection = await this.resolveMerchantConnection(
      merchantUberUserId,
      accessToken,
    );
    const response = await this.callUberApi('/v1/eats/stores', {
      accessToken: connection.accessToken,
      method: 'GET',
    });

    const stores = this.extractMerchantStores(response);
    const mappingRows = await this.prisma.uberStoreMapping.findMany({
      where: {
        merchantUberUserId: connection.merchantUberUserId,
        uberStoreId: { in: stores.map((store) => store.storeId) },
      },
      select: {
        uberStoreId: true,
        isProvisioned: true,
        provisionedAt: true,
        posExternalStoreId: true,
      },
    });
    const mappingByStoreId = new Map(
      mappingRows.map((row) => [row.uberStoreId, row]),
    );

    await this.persistMerchantStores(
      connection.merchantUberUserId,
      stores,
      response,
    );

    return {
      ok: true,
      merchantUberUserId: connection.merchantUberUserId,
      count: stores.length,
      stores: stores.map((store) => ({
        storeId: store.storeId,
        storeName: store.storeName,
        locationSummary: store.locationSummary,
        isProvisioned:
          mappingByStoreId.get(store.storeId)?.isProvisioned ??
          store.integrationEnabled,
        provisionedAt:
          mappingByStoreId.get(store.storeId)?.provisionedAt ??
          (store.integrationEnabled ? new Date() : null),
        posExternalStoreId:
          mappingByStoreId.get(store.storeId)?.posExternalStoreId ??
          store.posExternalStoreId,
        timezone: store.timezone,
      })),
      raw: response,
    };
  }

  async updatePosExternalStoreId(
    uberStoreId: string,
    posExternalStoreId: string,
  ) {
    const normalizedUberStoreId = uberStoreId.trim();
    const normalizedPosStoreId = posExternalStoreId.trim();
    if (!normalizedUberStoreId) {
      throw new BadRequestException('Uber Store ID 不能为空');
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalizedPosStoreId)) {
      throw new BadRequestException(
        'POS External Store ID 只能包含字母、数字、下划线和连字符',
      );
    }

    const storeMapping = this.uberStoreMappingDelegate;
    if (!storeMapping) {
      throw new BadRequestException('Prisma 未配置 uberStoreMapping 模型');
    }
    const existing = await storeMapping.findUnique({
      where: { uberStoreId: normalizedUberStoreId },
    });
    if (!existing) {
      throw new BadRequestException('Uber 门店映射不存在');
    }

    const mapping = await storeMapping.update({
      where: { uberStoreId: normalizedUberStoreId },
      data: { posExternalStoreId: normalizedPosStoreId },
    });
    await this.captureEvent('ubereats_pos_store_mapping_updated', {
      uberStoreId: normalizedUberStoreId,
      previousPosExternalStoreId: existing.posExternalStoreId,
      posExternalStoreId: normalizedPosStoreId,
    });
    return {
      ok: true,
      storeId: mapping.uberStoreId,
      posExternalStoreId: mapping.posExternalStoreId,
    };
  }

  async getMerchantConnectionStatus(merchantUberUserId?: string) {
    const connection = await this.resolveMerchantConnection(
      merchantUberUserId,
      undefined,
    );

    return {
      ok: true,
      merchantUberUserId: connection.merchantUberUserId,
      scope: connection.scope,
      tokenType: connection.tokenType,
      expiresAt: connection.expiresAt,
      connectedAt: connection.connectedAt,
    };
  }

  async provisionStore(
    accessToken: string | undefined,
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantUberUserId?: string,
  ) {
    if (!storeId.trim()) {
      throw new BadRequestException('storeId 不能为空');
    }

    const connection = await this.resolveMerchantConnection(
      merchantUberUserId,
      accessToken,
    );
    const response = await this.callUberApi(
      `/v1/eats/stores/${encodeURIComponent(storeId.trim())}/pos_data`,
      {
        method: 'POST',
        accessToken: connection.accessToken,
        body: {
          ...payload,
        },
      },
    );
    const mapping = await this.upsertStoreMapping({
      merchantUberUserId: connection.merchantUberUserId,
      uberStoreId: storeId.trim(),
      storeName: this.readString(
        this.asObject(response.store)?.name,
        response.store_name,
      ),
      locationSummary: this.readLocationSummary(response),
      isProvisioned: true,
      posExternalStoreId: this.readString(response.pos_external_store_id),
      raw: response,
    });

    await this.captureEvent('ubereats_store_provision_requested', {
      merchantUberUserId: connection.merchantUberUserId,
      uberStoreId: storeId.trim(),
    });

    return {
      ok: true,
      merchantUberUserId: connection.merchantUberUserId,
      storeId: storeId.trim(),
      isProvisioned: mapping.isProvisioned,
      provisionedAt: mapping.provisionedAt,
      response,
    };
  }

  revokeOrDeprovisionStore() {
    throw new NotImplementedException('deprovision MVP 暂未实现');
  }

  async handleWebhook(input: UberWebhookInput): Promise<void> {
    this.verifyWebhookSignature(input.headers, input.rawBody);

    let body: unknown;
    try {
      body = JSON.parse(
        Buffer.isBuffer(input.rawBody)
          ? input.rawBody.toString('utf8')
          : input.rawBody,
      );
    } catch {
      throw new BadRequestException('Uber webhook JSON 无效');
    }

    const envelope = UberWebhookEnvelopeDto.parse(body);
    const eventType = envelope?.eventType ?? this.readEventType(body);
    const eventId =
      this.readEventId(input.headers, body, envelope?.eventId) ??
      `sha256:${this.hashCanonicalBody(body)}`;

    const claimed = await this.claimWebhookEvent(
      eventId,
      eventType,
      envelope?.resourceId ?? null,
      body,
    );
    if (!claimed) {
      this.logger.warn(
        `[ubereats webhook] duplicate ignored eventType=${eventType} eventId=${eventId}`,
      );
      return;
    }

    try {
      switch (this.normalizeEventType(eventType)) {
        case 'orders.notification':
        case 'orders.accepted':
        case 'orders.in_progress':
        case 'orders.making':
        case 'orders.ready_for_pickup':
        case 'orders.completed':
        case 'orders.cancelled':
        case 'orders.cancel':
        case 'orders.rejected':
          await this.handleOrderWebhook(eventType, eventId, envelope);
          break;

        case 'store.provisioned':
          await this.handleStoreProvisionedWebhook(eventType, eventId, body);
          break;

        case 'store.deprovisioned':
          await this.handleStoreDeprovisionedWebhook(eventType, eventId, body);
          break;

        case 'store.status.changed':
          await this.handleStoreStatusChangedWebhook(eventType, eventId, body);
          break;

        case 'menus.notification':
          await this.handleMenuNotificationWebhook(eventType, eventId, body);
          break;

        default:
          await this.captureEvent('ubereats_webhook_unhandled', {
            eventType,
            eventId,
            orderRelated: this.isOrderRelatedEvent(eventType),
          });
          if (this.isOrderRelatedEvent(eventType)) {
            throw new BadRequestException(
              `未识别的 Uber 订单事件类型: ${eventType}`,
            );
          }
          break;
      }

      // Order persistence marks the inbox PROCESSED in the same transaction.
      // Other event families use this durable, retryable state-machine boundary.
      await this.prisma.uberWebhookInbox.updateMany({
        where: { eventId, status: 'PROCESSING' },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          errorSummary: null,
          nextRetryAt: null,
        },
      });
    } catch (error) {
      const nonRetryable = error instanceof UberWebhookNonRetryableError;
      await this.markWebhookFailed(eventId, error, {
        retryable: !nonRetryable,
      });
      if (nonRetryable) {
        await this.captureEvent('ubereats_webhook_non_retryable_failed', {
          eventType,
          eventId,
          status: error.status,
          detail: error.detail,
        });
        return;
      }
      throw error;
    }
  }

  async syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    const clientRequestId = this.toClientRequestId(externalOrderId);
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true },
    });

    if (!order) {
      await this.captureEvent('ubereats_order_sync_failed', {
        externalOrderId,
        status,
        reason: 'order_not_found',
      });
      return {
        ok: false,
        externalOrderId,
        status,
        reason: 'ORDER_NOT_FOUND',
      };
    }

    const action = UBER_ACTION_BY_LOCAL_STATUS[status];
    if (!action) {
      throw new BadRequestException(
        `本地状态 ${status} 没有 Uber 文档支持的外部动作`,
      );
    }

    // Local transition and the action outbox row commit atomically. A worker may
    // call processPendingUberOrderActions after a crash; the eager call below is
    // only a latency optimisation.
    const updated = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.order.updateMany({
        where: {
          id: order.id,
          status: { in: [OrderStatus.paid, OrderStatus.making] },
        },
        data: { status, readyAt: new Date() },
      });
      if (!transition.count) {
        // The status read before opening the transaction can be stale when two
        // POS devices click at once. Re-read under this transaction so an
        // already-ready order is an idempotent success, never a regression.
        const current = await tx.order.findUnique({
          where: { id: order.id },
          select: { status: true },
        });
        if (current?.status !== OrderStatus.ready) {
          throw new BadRequestException(
            'Uber 订单必须先接单，且状态不能并发回退',
          );
        }
      }
      await tx.uberOrderAction.upsert({
        where: { externalOrderId_action: { externalOrderId, action } },
        create: { externalOrderId, action, status: 'PENDING' },
        update: {},
      });
      return { orderStableId: order.orderStableId, status };
    });

    const result = await this.executeUberOrderAction(
      externalOrderId,
      action,
      {},
      true,
    );

    await this.captureEvent('ubereats_order_status_synced', {
      externalOrderId,
      orderStableId: updated.orderStableId,
      status,
      action,
      actionResult: result.ok ? 'SUCCEEDED' : 'FAILED',
    });

    return {
      ok: true,
      externalOrderId,
      orderStableId: updated.orderStableId,
      status: updated.status,
      action,
      localStatus: updated.status,
      uberSyncStatus: result.status,
      actionResult: result,
    };
  }

  async getReadyForPickupAction(externalOrderId: string) {
    return this.uberOrderActionDelegate.findUnique({
      where: {
        externalOrderId_action: {
          externalOrderId,
          action: 'READY_FOR_PICKUP',
        },
      },
    });
  }

  async retryReadyForPickup(externalOrderId: string) {
    const record = await this.getReadyForPickupAction(externalOrderId);
    if (!record) throw new BadRequestException('没有可重试的 Uber 就绪动作');
    if (record.status === 'FAILED' && !record.retryable) {
      return this.toUberOrderActionResult(record, true);
    }
    return this.executeUberOrderAction(
      externalOrderId,
      'READY_FOR_PICKUP',
      {},
      true,
    );
  }

  /** Queue workers can periodically drain retryable/PENDING outbox rows. */
  async processPendingUberOrderActions(limit = 50) {
    const rows = await this.uberOrderActionDelegate.findMany({
      where: {
        OR: [{ status: 'PENDING' }, { status: 'FAILED', retryable: true }],
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    return Promise.all(
      rows.map((row) => {
        const retryPayload =
          row.action === 'DENY'
            ? this.buildUberDenyOrderPayload(
                row.reasonCode ?? 'OTHER',
                row.reasonDetail ?? undefined,
              )
            : {};
        return this.executeUberOrderAction(
          row.externalOrderId,
          row.action,
          retryPayload,
          true,
        );
      }),
    );
  }

  /** Accept only an order whose complete local transaction has committed. */
  async acceptUberOrder(externalOrderId: string) {
    const normalizedOrderId = externalOrderId.trim();
    const localOrder = await this.prisma.order.findUnique({
      where: { clientRequestId: this.toClientRequestId(normalizedOrderId) },
      select: { id: true },
    });
    if (!localOrder) {
      throw new BadRequestException('订单尚未完整落库，禁止向 Uber 接单');
    }
    return this.executeUberOrderAction(normalizedOrderId, 'ACCEPT', {
      reason: 'accepted',
    });
  }

  /** Deny through Uber's POS decision endpoint with an auditable reason. */
  async denyUberOrder(
    externalOrderId: string,
    reasonCode: string,
    reasonDetail?: string,
  ) {
    const normalizedReason = reasonCode.trim();
    if (!normalizedReason) {
      throw new BadRequestException('拒单原因不能为空');
    }
    return this.executeUberOrderAction(
      externalOrderId.trim(),
      'DENY',
      this.buildUberDenyOrderPayload(normalizedReason, reasonDetail),
      false,
      {
        reasonCode: normalizedReason,
        reasonDetail: reasonDetail?.trim() || undefined,
      },
    );
  }

  private buildUberDenyOrderPayload(
    reasonCode: string,
    reasonDetail?: string,
  ): { reason: { code: UberDenyReasonCode; explanation: string } } {
    const normalizedReason = reasonCode.trim();
    const detail = reasonDetail?.trim();
    const uberReasonCode = this.toUberDenyReasonCode(normalizedReason);

    return {
      reason: {
        code: uberReasonCode,
        explanation: detail || normalizedReason || uberReasonCode,
      },
    };
  }

  private toUberDenyReasonCode(reasonCode: string): UberDenyReasonCode {
    switch (reasonCode.trim().toUpperCase()) {
      case 'STORE_CLOSED':
      case 'POS_NOT_READY':
      case 'POS_OFFLINE':
      case 'MISSING_ITEM':
      case 'MISSING_INFO':
      case 'PRICING':
      case 'CAPACITY':
      case 'ADDRESS':
      case 'SPECIAL_INSTRUCTIONS':
        return reasonCode.trim().toUpperCase() as UberDenyReasonCode;
      case 'ITEM_UNAVAILABLE':
      case 'ITEM_AVAILABILITY':
        return 'ITEM_AVAILABILITY';
      case 'INVALID_ORDER':
      default:
        return 'OTHER';
    }
  }

  async listPendingUberOrders() {
    const rows = await this.prisma.order.findMany({
      where: {
        channel: Channel.ubereats,
        status: {
          in: [OrderStatus.pending, OrderStatus.paid, OrderStatus.making],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        orderStableId: true,
        clientRequestId: true,
        status: true,
        totalCents: true,
        createdAt: true,
      },
    });

    return {
      count: rows.length,
      items: rows.map((row) => ({
        orderStableId: row.orderStableId,
        externalOrderId: row.clientRequestId?.replace('ubereats:', '') ?? null,
        status: row.status,
        totalCents: row.totalCents,
        createdAt: row.createdAt,
      })),
    };
  }

  async syncStoreStatusToUber() {
    const config = await this.ensureBusinessConfig();
    const mappingDelegate = this.uberStoreMappingDelegate;
    if (!mappingDelegate) {
      throw new BadRequestException('UberStoreMapping 数据表不可用');
    }

    const mappings = await mappingDelegate.findMany({
      orderBy: { uberStoreId: 'asc' },
    });
    const pause = this.parseUberPause(config.temporaryCloseReason);
    const payload: Record<string, string> = config.isTemporarilyClosed
      ? {
          status: 'PAUSED',
          reason: pause.reason,
          ...(pause.pauseUntil ? { pause_until: pause.pauseUntil } : {}),
        }
      : { status: 'ONLINE' };
    const results: Array<Record<string, unknown>> = [];

    for (const mapping of mappings) {
      if (!mapping.isProvisioned) {
        const result = {
          uberStoreId: mapping.uberStoreId,
          ok: false,
          skipped: true,
          status: 422,
          error: 'Uber 门店尚未 provision，未发送状态写请求',
        };
        results.push(result);
        await this.saveStoreStatusResult(result, payload);
        await this.createStoreStatusAlert(
          mapping.uberStoreId,
          result.error,
          422,
        );
        continue;
      }

      const result = await this.writeUberStoreStatus(
        mapping.uberStoreId,
        payload,
      );
      results.push(result);
      await this.saveStoreStatusResult(result, payload);
      if (
        !result.ok &&
        typeof result.status === 'number' &&
        result.status >= 400 &&
        result.status < 500
      ) {
        await this.createStoreStatusAlert(
          mapping.uberStoreId,
          typeof result.error === 'string'
            ? result.error
            : 'Uber 门店状态写入被拒绝',
          result.status,
        );
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    return {
      ok: results.length > 0 && succeeded === results.length,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      payload,
      results,
    };
  }

  private parseUberPause(reason: string | null | undefined) {
    const prefix = '__AUTO_UNTIL__:';
    if (!reason?.startsWith(prefix)) {
      return { reason: reason?.trim() || '门店临时暂停营业', pauseUntil: null };
    }
    const [rawUntil, ...reasonParts] = reason.slice(prefix.length).split('|');
    const until = new Date(rawUntil.trim());
    return {
      reason: reasonParts.join('|').trim() || '门店临时暂停营业',
      pauseUntil: Number.isNaN(until.getTime()) ? null : until.toISOString(),
    };
  }

  private async writeUberStoreStatus(
    uberStoreId: string,
    payload: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const maxAttempts = 3;
    let lastStatus: number | null = null;
    let lastError = '';
    let attempts = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attempts = attempt;
      try {
        const token = await this.uberAuthService.getAccessToken(
          'eats.store.status.write',
        );
        const response = await fetch(
          `${this.uberApiBaseUrl.replace(/\/$/, '')}/v1/eats/stores/${encodeURIComponent(uberStoreId)}/status`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
        );
        lastStatus = response.status;
        const rawText = await response.text();
        lastError = response.ok
          ? ''
          : this.summarizeDebugResponse(this.tryParseJson(rawText), rawText);
        // A repeated pause may race with/replay an already applied request.
        if (response.ok || response.status === 409) {
          return {
            uberStoreId,
            ok: true,
            duplicate: response.status === 409,
            status: response.status,
            attempts: attempt,
          };
        }
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 25 * 2 ** (attempt - 1)),
        );
      }
    }
    return {
      uberStoreId,
      ok: false,
      status: lastStatus,
      attempts,
      error: lastError || 'Uber 门店状态写入失败',
    };
  }

  private async saveStoreStatusResult(
    result: Record<string, unknown>,
    payload: Record<string, string>,
  ) {
    await this.captureEvent('ubereats_store_status_sync_result', {
      ...result,
      payload,
    } as Prisma.JsonObject);
  }

  private async createStoreStatusAlert(
    uberStoreId: string,
    error: string,
    status: number,
  ) {
    await this.prisma.uberOpsTicket.create({
      data: {
        storeId: uberStoreId,
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Uber 门店状态同步需要运营处理',
        description: error,
        context: { uberStoreId, uberHttpStatus: status },
      },
    });
  }

  async listUberItemChannelConfigs(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const items = await this.prisma.uberItemChannelConfig.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: {
        menuItemStableId: true,
        priceCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
        externalItemId: true,
        externalCategoryId: true,
        lastPublishedAt: true,
        lastPublishError: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: items.length,
      items,
    };
  }

  async listUberPublishedMenuItems(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const items = await (
      this.prisma as unknown as {
        uberPublishedMenuItem: { findMany: (args: unknown) => Promise<any[]> };
      }
    ).uberPublishedMenuItem.findMany({
      where: {
        storeId: normalizedStoreId,
        publishVersion: {
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
      select: {
        publishVersionId: true,
        uberStoreId: true,
        uberItemId: true,
        menuItemStableId: true,
        publishedPriceCents: true,
        publishedIsAvailable: true,
        publishedName: true,
        publishedAt: true,
        publishVersion: { select: { versionStableId: true, status: true } },
      },
    });

    return { storeId: normalizedStoreId, count: items.length, items };
  }

  async listUberOptionItemConfigs(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const items = await this.prisma.uberOptionItemConfig.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
      select: {
        optionChoiceStableId: true,
        priceDeltaCents: true,
        isAvailable: true,
        displayName: true,
        displayDescription: true,
        externalItemId: true,
        lastPublishedAt: true,
        lastPublishError: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: items.length,
      items,
    };
  }

  async upsertUberItemChannelConfig(input: UpsertPriceBookItemInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureMenuItemExists(input.menuItemStableId);

    const row = await this.prisma.uberItemChannelConfig.upsert({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        menuItemStableId: input.menuItemStableId,
        priceCents: Math.max(1, Math.round(input.priceCents)),
        isAvailable: input.isAvailable ?? true,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
      },
      update: {
        priceCents: Math.max(1, Math.round(input.priceCents)),
        ...(typeof input.isAvailable === 'boolean'
          ? { isAvailable: input.isAvailable }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.displayDescription !== undefined
          ? { displayDescription: input.displayDescription?.trim() || null }
          : {}),
      },
    });

    await this.captureEvent('ubereats_price_book_item_upserted', {
      storeId: normalizedStoreId,
      menuItemStableId: input.menuItemStableId,
      priceCents: row.priceCents,
      isAvailable: row.isAvailable,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: row,
    };
  }

  async upsertUberOptionItemConfig(input: UpsertOptionItemConfigInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureOptionChoiceExists(input.optionChoiceStableId);

    const row = await this.prisma.uberOptionItemConfig.upsert({
      where: {
        storeId_optionChoiceStableId: {
          storeId: normalizedStoreId,
          optionChoiceStableId: input.optionChoiceStableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        optionChoiceStableId: input.optionChoiceStableId,
        priceDeltaCents: Math.round(input.priceDeltaCents ?? 0),
        isAvailable: input.isAvailable ?? true,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
      },
      update: {
        ...(input.priceDeltaCents !== undefined
          ? { priceDeltaCents: Math.round(input.priceDeltaCents) }
          : {}),
        ...(typeof input.isAvailable === 'boolean'
          ? { isAvailable: input.isAvailable }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.displayDescription !== undefined
          ? { displayDescription: input.displayDescription?.trim() || null }
          : {}),
      },
    });

    await this.captureEvent('ubereats_option_item_config_upserted', {
      storeId: normalizedStoreId,
      optionChoiceStableId: input.optionChoiceStableId,
      priceDeltaCents: row.priceDeltaCents,
      isAvailable: row.isAvailable,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: row,
    };
  }

  async getUberMenuDraft(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const storeMapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        OR: [
          { posExternalStoreId: normalizedStoreId },
          { uberStoreId: normalizedStoreId },
        ],
        isProvisioned: true,
      },
      select: { uberStoreId: true },
    });
    const uberStoreId =
      storeMapping?.uberStoreId ?? `draft:${normalizedStoreId}`;
    const graph = await this.buildUberMenuGraph(normalizedStoreId, uberStoreId);
    const normalized = this.normalizeAndValidateUberMenuGraph(graph);
    const schedule = await this.getUberMenuSchedule();
    const payload = this.buildUberUploadMenuPayload(
      normalized.graph,
      schedule.serviceAvailability,
      schedule.taxRatePercentage,
    );
    const payloadValidation = this.validateUberMenuPayload(payload);
    const summary = this.summarizePublishGraph(normalized.graph);
    const lastPublishedVersion =
      await this.prisma.uberMenuPublishVersion.findFirst({
        where: { storeId: normalizedStoreId },
        orderBy: { createdAt: 'desc' },
        select: {
          versionStableId: true,
          status: true,
          createdAt: true,
          totalItems: true,
          changedItems: true,
          errorMessage: true,
          errorDetails: true,
          finishedAt: true,
        },
      });

    const buildDraftCategories = (
      groups: Array<{
        id: string;
        title: string;
        minSelect: number;
        maxSelect: number;
        optionItemIds: string[];
      }>,
      items: Array<{
        id: string;
        sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
        sourceStableId: string;
        title: string;
        description: string | null;
        priceCents: number;
        isAvailable: boolean;
        modifierGroupIds: string[];
        imageUrl: string | null;
      }>,
    ) => {
      const groupMap = new Map(groups.map((group) => [group.id, group]));
      const itemMap = new Map(items.map((item) => [item.id, item]));
      return graph.categories.map((category) => ({
        id: category.id,
        name: category.title,
        items: category.entities
          .map((itemId) => itemMap.get(itemId))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .filter((item) => item.sourceType === 'MENU_ITEM')
          .map((item) => ({
            id: item.id,
            sourceMenuItemStableId: item.sourceStableId,
            displayName: item.title,
            displayDescription: item.description,
            priceCents: item.priceCents,
            isAvailable: item.isAvailable,
            imageUrl: item.imageUrl,
            groups: item.modifierGroupIds
              .map((groupId) => {
                const group = groupMap.get(groupId);
                if (!group) return null;
                return {
                  id: group.id,
                  name: group.title,
                  minSelect: group.minSelect,
                  maxSelect: group.maxSelect,
                  options: group.optionItemIds
                    .map((optionItemId) => itemMap.get(optionItemId))
                    .filter((option): option is NonNullable<typeof option> =>
                      Boolean(option),
                    )
                    .map((option) => ({
                      id: option.id,
                      sourceOptionChoiceStableId: option.sourceStableId,
                      displayName: option.title,
                      priceDeltaCents: option.priceCents,
                      isAvailable: option.isAvailable,
                      childGroups: option.modifierGroupIds
                        .map((childGroupId) => {
                          const childGroup = groupMap.get(childGroupId);
                          return childGroup
                            ? {
                                id: childGroup.id,
                                name: childGroup.title,
                                minSelect: childGroup.minSelect,
                                maxSelect: childGroup.maxSelect,
                              }
                            : null;
                        })
                        .filter(
                          (
                            childGroup,
                          ): childGroup is {
                            id: string;
                            name: string;
                            minSelect: number;
                            maxSelect: number;
                          } => Boolean(childGroup),
                        ),
                    })),
                };
              })
              .filter(
                (
                  group,
                ): group is {
                  id: string;
                  name: string;
                  minSelect: number;
                  maxSelect: number;
                  options: Array<{
                    id: string;
                    sourceOptionChoiceStableId: string;
                    displayName: string;
                    priceDeltaCents: number;
                    isAvailable: boolean;
                    childGroups: Array<{
                      id: string;
                      name: string;
                      minSelect: number;
                      maxSelect: number;
                    }>;
                  }>;
                } => Boolean(group),
              ),
          })),
      }));
    };
    const uberDraftCategories = buildDraftCategories(
      normalized.graph.groups,
      normalized.graph.items,
    );
    const sourceDraftCategories = buildDraftCategories(
      graph.sourceGroups,
      graph.sourceItems,
    );
    const uberDraftTreeNodes =
      this.buildUberDraftTreeNodes(uberDraftCategories);

    return {
      storeId: normalizedStoreId,
      sourceMenu: {
        categories: graph.categories.length,
        items: graph.sourceItems.filter(
          (item) => item.sourceType === 'MENU_ITEM',
        ).length,
        optionItems: graph.sourceItems.filter(
          (item) => item.sourceType === 'OPTION_ITEM',
        ).length,
        groups: graph.sourceGroups.length,
        tree: { categories: sourceDraftCategories },
      },
      uberDraft: {
        menuId: graph.menuId,
        categories: normalized.graph.categories,
        items: normalized.graph.items,
        groups: normalized.graph.groups,
        edges: this.buildUberDraftEdges(normalized.graph),
        tree: {
          categories: uberDraftCategories,
        },
        treeNodes: uberDraftTreeNodes,
        optionMappings: graph.optionMappings,
      },
      mappingErrors: graph.mappingErrors,
      validation: {
        warnings: normalized.warnings,
        errors: [...normalized.errors, ...payloadValidation],
      },
      mappingWarnings: [
        ...payloadValidation,
        ...(storeMapping?.uberStoreId
          ? []
          : [
              {
                code: 'UBER_STORE_NOT_PROVISIONED',
                severity: 'WARNING' as const,
                path: '$',
                sourceStableId: null,
                message:
                  '当前门店尚未完成 Uber store provision，返回的是本地 draft 图。',
              },
            ]),
      ],
      publishSummary: summary,
      serviceAvailability: schedule.serviceAvailability,
      serviceAvailabilityTimezone: schedule.timezone,
      dirty: summary.changedItems > 0,
      lastPublishedVersion,
    };
  }

  async updateUberDraftItem(itemId: string, input: UpdateDraftItemInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureMenuItemExists(itemId);

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { stableId: itemId },
      select: { basePriceCents: true, isAvailable: true },
    });
    if (!menuItem) {
      throw new BadRequestException(`菜单项 ${itemId} 不存在`);
    }

    const row = await this.prisma.uberItemChannelConfig.upsert({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: itemId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        menuItemStableId: itemId,
        priceCents: Math.max(
          1,
          Math.round(input.priceCents ?? menuItem.basePriceCents),
        ),
        isAvailable: input.isAvailable ?? menuItem.isAvailable,
        displayName: input.displayName?.trim() || null,
        displayDescription: input.displayDescription?.trim() || null,
      },
      update: {
        ...(input.priceCents !== undefined
          ? { priceCents: Math.max(1, Math.round(input.priceCents)) }
          : {}),
        ...(input.isAvailable !== undefined
          ? { isAvailable: input.isAvailable }
          : {}),
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.displayDescription !== undefined
          ? { displayDescription: input.displayDescription?.trim() || null }
          : {}),
      },
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      itemId,
      config: row,
      warnings:
        input.sortOrder !== undefined
          ? ['当前没有 Uber item 独立 sortOrder 字段，已忽略 sortOrder 更新。']
          : [],
    };
  }

  async updateUberDraftGroup(groupId: string, input: UpdateDraftGroupInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    const template = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: {
        stableId: true,
        nameEn: true,
        defaultMinSelect: true,
        defaultMaxSelect: true,
      },
    });
    if (!template) {
      throw new BadRequestException(`选项模板组 ${groupId} 不存在`);
    }

    const minSelect =
      input.required === true
        ? Math.max(1, input.minSelect ?? template.defaultMinSelect)
        : (input.minSelect ?? template.defaultMinSelect);
    const maxSelect = Math.max(
      minSelect,
      input.maxSelect ?? template.defaultMaxSelect ?? 1,
    );

    const row = await this.prisma.uberModifierGroupConfig.upsert({
      where: {
        storeId_templateGroupStableId: {
          storeId: normalizedStoreId,
          templateGroupStableId: groupId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        templateGroupStableId: groupId,
        displayName: input.name?.trim() || template.nameEn,
        minSelect,
        maxSelect,
      },
      update: {
        ...(input.name !== undefined
          ? { displayName: input.name?.trim() || null }
          : {}),
        ...(input.minSelect !== undefined || input.required !== undefined
          ? { minSelect }
          : {}),
        ...(input.maxSelect !== undefined || input.required !== undefined
          ? { maxSelect }
          : {}),
      },
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      groupId,
      config: row,
      warnings:
        input.sortOrder !== undefined
          ? ['当前没有 Uber group 独立 sortOrder 字段，已忽略 sortOrder 更新。']
          : [],
    };
  }

  async updateUberDraftOption(
    optionItemId: string,
    input: UpdateDraftOptionInput,
  ) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureOptionChoiceExists(optionItemId);
    const choice = await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId: optionItemId },
      select: { priceDeltaCents: true, isAvailable: true },
    });
    if (!choice) {
      throw new BadRequestException(`选项 ${optionItemId} 不存在`);
    }

    const row = await this.prisma.uberOptionItemConfig.upsert({
      where: {
        storeId_optionChoiceStableId: {
          storeId: normalizedStoreId,
          optionChoiceStableId: optionItemId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        optionChoiceStableId: optionItemId,
        displayName: input.displayName?.trim() || null,
        priceDeltaCents: Math.round(
          input.priceDeltaCents ?? choice.priceDeltaCents,
        ),
        isAvailable: input.isAvailable ?? choice.isAvailable,
      },
      update: {
        ...(input.displayName !== undefined
          ? { displayName: input.displayName?.trim() || null }
          : {}),
        ...(input.priceDeltaCents !== undefined
          ? { priceDeltaCents: Math.round(input.priceDeltaCents) }
          : {}),
        ...(input.isAvailable !== undefined
          ? { isAvailable: input.isAvailable }
          : {}),
      },
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      optionItemId,
      config: row,
      warnings:
        input.sortOrder !== undefined
          ? [
              '当前没有 Uber option 独立 sortOrder 字段，已忽略 sortOrder 更新。',
            ]
          : [],
    };
  }

  async bindUberDraftOptionChildGroup(
    optionItemId: string,
    groupId: string,
    storeId?: string,
  ) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const parentChoice = await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId: optionItemId },
      select: { stableId: true },
    });
    if (!parentChoice) {
      throw new BadRequestException(`选项 ${optionItemId} 不存在`);
    }

    const childGroup = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: { stableId: true },
    });
    if (!childGroup) {
      throw new BadRequestException(`模板组 ${groupId} 不存在`);
    }

    await this.prisma.uberOptionChildGroupBinding.upsert({
      where: {
        storeId_parentOptionChoiceStableId_childTemplateGroupStableId: {
          storeId: normalizedStoreId,
          parentOptionChoiceStableId: parentChoice.stableId,
          childTemplateGroupStableId: childGroup.stableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        parentOptionChoiceStableId: parentChoice.stableId,
        childTemplateGroupStableId: childGroup.stableId,
        isBound: true,
      },
      update: { isBound: true },
    });

    await this.captureEvent('ubereats_draft_option_child_group_bound', {
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      mode: 'uber_binding_only',
    });

    return { ok: true, storeId: normalizedStoreId, optionItemId, groupId };
  }

  async unbindUberDraftOptionChildGroup(
    optionItemId: string,
    groupId: string,
    storeId?: string,
  ) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const parentChoice = await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId: optionItemId },
      select: { stableId: true },
    });
    if (!parentChoice) {
      throw new BadRequestException(`选项 ${optionItemId} 不存在`);
    }

    const childGroup = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: { stableId: true },
    });
    if (!childGroup) {
      throw new BadRequestException(`模板组 ${groupId} 不存在`);
    }

    const row = await this.prisma.uberOptionChildGroupBinding.upsert({
      where: {
        storeId_parentOptionChoiceStableId_childTemplateGroupStableId: {
          storeId: normalizedStoreId,
          parentOptionChoiceStableId: parentChoice.stableId,
          childTemplateGroupStableId: childGroup.stableId,
        },
      },
      create: {
        storeId: normalizedStoreId,
        parentOptionChoiceStableId: parentChoice.stableId,
        childTemplateGroupStableId: childGroup.stableId,
        isBound: false,
      },
      update: { isBound: false },
    });

    await this.captureEvent('ubereats_draft_option_child_group_unbound', {
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      isBound: row.isBound,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      deletedCount: 1,
    };
  }

  async getUberMenuDraftDiff(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const draft = await this.getUberMenuDraft(normalizedStoreId);
    const lastSuccess = await this.prisma.uberMenuPublishVersion.findFirst({
      where: {
        storeId: normalizedStoreId,
        status: UberMenuPublishStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, requestPayload: true, payload: true },
    });
    const [itemConfigs, optionConfigs] = await Promise.all([
      this.prisma.uberItemChannelConfig.findMany({
        where: { storeId: normalizedStoreId, lastPublishedAt: { not: null } },
        select: { menuItemStableId: true },
      }),
      this.prisma.uberOptionItemConfig.findMany({
        where: { storeId: normalizedStoreId, lastPublishedAt: { not: null } },
        select: { optionChoiceStableId: true },
      }),
    ]);
    const publishedMenuItemSet = new Set(
      itemConfigs.map((item) => item.menuItemStableId),
    );
    const publishedOptionSet = new Set(
      optionConfigs.map((item) => item.optionChoiceStableId),
    );

    const changedItems = draft.uberDraft.items.filter((item) => item.hasDelta);
    const addedItems = changedItems.filter(
      (item) =>
        (item.sourceType === 'MENU_ITEM' &&
          !publishedMenuItemSet.has(item.sourceStableId)) ||
        (item.sourceType === 'OPTION_ITEM' &&
          !publishedOptionSet.has(item.sourceStableId)),
    );
    const draftItemIdSet = new Set(
      draft.uberDraft.items.map((item) => item.id),
    );
    const draftGroupIdSet = new Set(
      draft.uberDraft.groups.map((group) => group.id),
    );
    const draftEdgeSet = new Set(
      draft.uberDraft.edges.map(
        (edge) => `${edge.type}:${edge.from}->${edge.to}`,
      ),
    );
    const publishedSnapshot = this.extractPublishedSnapshotFromPayload(
      lastSuccess?.requestPayload ?? lastSuccess?.payload ?? null,
    );

    return {
      storeId: normalizedStoreId,
      lastPublishedAt: lastSuccess?.createdAt ?? null,
      addedItems: addedItems.map((item) => item.sourceStableId),
      modifiedItems: changedItems.map((item) => ({
        sourceType: item.sourceType,
        stableId: item.sourceStableId,
        priceCents: item.priceCents,
        isAvailable: item.isAvailable,
      })),
      deletedItems: Array.from(publishedSnapshot.itemIds).filter(
        (itemId) => !draftItemIdSet.has(itemId),
      ),
      addedGroups: draft.uberDraft.groups
        .filter((group) => group.optionItemIds.length > 0)
        .map((group) => group.sourceStableId),
      modifiedGroups: draft.uberDraft.groups
        .filter((group) => group.minSelect > 0 || group.maxSelect > 1)
        .map((group) => ({
          stableId: group.sourceStableId,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
        })),
      deletedGroups: Array.from(publishedSnapshot.groupIds).filter(
        (groupId) => !draftGroupIdSet.has(groupId),
      ),
      hierarchyChanges: draft.uberDraft.edges,
      deletedEdges: Array.from(publishedSnapshot.edgeKeys)
        .filter((edgeKey) => !draftEdgeSet.has(edgeKey))
        .map((edgeKey) => this.decodeDraftEdgeKey(edgeKey))
        .filter((edge): edge is { from: string; to: string; type: string } =>
          Boolean(edge),
        ),
      priceChanges: changedItems.map((item) => ({
        sourceType: item.sourceType,
        stableId: item.sourceStableId,
        priceCents: item.priceCents,
      })),
      availabilityChanges: changedItems.map((item) => ({
        sourceType: item.sourceType,
        stableId: item.sourceStableId,
        isAvailable: item.isAvailable,
      })),
    };
  }

  async publishUberMenu(input: PublishMenuInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    const uberStoreId = await this.resolveUberStoreIdOrThrow(normalizedStoreId);
    const graph = await this.buildUberMenuGraphWithFilters(
      normalizedStoreId,
      uberStoreId,
      {
        excludedCategoryIds: new Set(input.excludedCategoryIds ?? []),
        excludedGroupIds: new Set(input.excludedGroupIds ?? []),
        excludedMenuItemStableIds: new Set(
          input.excludedMenuItemStableIds ?? [],
        ),
        excludedOptionChoiceStableIds: new Set(
          input.excludedOptionChoiceStableIds ?? [],
        ),
      },
    );
    const normalized = this.normalizeAndValidateUberMenuGraph(graph);
    const schedule = await this.getUberMenuSchedule();
    const payload = this.buildUberUploadMenuPayload(
      normalized.graph,
      schedule.serviceAvailability,
      schedule.taxRatePercentage,
    );
    const imageValidation = await this.validateUberMenuImages(payload);
    const payloadValidation = [
      ...this.validateUberMenuPayload(payload),
      ...imageValidation.issues,
    ];
    const validationErrors = [...normalized.errors, ...payloadValidation];
    const summary = this.summarizePublishGraph(normalized.graph);

    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Uber 菜单发布 payload 校验失败，已阻止请求。',
        mappingErrors: graph.mappingErrors,
        validation: { warnings: normalized.warnings, errors: validationErrors },
      });
    }

    if (input.dryRun) {
      await this.captureEvent('ubereats_menu_publish_dry_run', {
        storeId: normalizedStoreId,
        uberStoreId,
        summary,
      });
      return {
        ok: true,
        dryRun: true,
        storeId: normalizedStoreId,
        uberStoreId,
        summary,
        serviceAvailability: schedule.serviceAvailability,
        serviceAvailabilityTimezone: schedule.timezone,
        taxRate: {
          percentage: schedule.taxRatePercentage,
          source: schedule.taxRateSource,
          requiresAdminConfirmation: true,
          confirmed: input.taxRateConfirmed === true,
        },
        imageValidation: imageValidation.results,
        modifierFlattening: this.buildModifierFlatteningReport(
          normalized.graph,
          graph.optionMappings,
        ),
        payload,
        mappingErrors: graph.mappingErrors,
        validation: {
          warnings: normalized.warnings,
          errors: validationErrors,
        },
      };
    }

    if (input.taxRateConfirmed !== true) {
      throw new BadRequestException(
        `正式发布前必须由管理员确认税率 ${schedule.taxRatePercentage}%（来源：${schedule.taxRateSource}）。`,
      );
    }

    await this.assertUberStoreTimezone(
      uberStoreId,
      schedule.timezone,
      input.timezoneConfirmed === true,
    );

    const version = await this.createMenuPublishVersionStarted(
      normalizedStoreId,
      uberStoreId,
      summary,
      payload,
      normalized.graph,
    );

    try {
      const response = await this.uploadUberMenu(uberStoreId, payload);
      await this.markMenuPublishVersionSubmitted(version.id, response);

      const finalStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED' = 'SUBMITTED';
      if (!this.hasMenuNotificationCapability()) {
        void this.pollUploadedMenuUntilTerminal(
          version.id,
          normalizedStoreId,
          uberStoreId,
          payload,
        ).catch((error) =>
          this.logger.error(
            `[ubereats menu] confirmation task failed versionId=${version.id}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }

      await this.captureEvent('ubereats_menu_published', {
        storeId: normalizedStoreId,
        uberStoreId,
        versionStableId: version.versionStableId,
        status: finalStatus,
        totalItems: summary.totalItems,
        changedItems: summary.changedItems,
      });

      return {
        ok: true,
        dryRun: false,
        storeId: normalizedStoreId,
        uberStoreId,
        versionStableId: version.versionStableId,
        createdAt: version.createdAt,
        summary,
      };
    } catch (error) {
      await this.markMenuPublishVersionFailed(
        version.id,
        error instanceof Error ? error.message : `${error}`,
      );
      throw error;
    }
  }

  async syncUberMenuItemAvailability(
    input: SyncAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult> {
    await this.ensureMenuItemExists(input.menuItemStableId);
    const requestedStoreId = input.storeId?.trim();
    const configs = await this.prisma.uberItemChannelConfig.findMany({
      where: {
        menuItemStableId: input.menuItemStableId,
        ...(requestedStoreId ? { storeId: requestedStoreId } : {}),
      },
    });
    if (configs.length === 0) {
      return { status: 'SKIPPED_NOT_PUBLISHED', stores: [] };
    }

    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: { isProvisioned: true },
      select: { posExternalStoreId: true, uberStoreId: true },
    });
    const stores: UberAvailabilitySyncResult['stores'] = [];
    for (const config of configs) {
      const mapping = mappings.find(
        (candidate) =>
          candidate.posExternalStoreId === config.storeId ||
          candidate.uberStoreId === config.uberStoreId,
      );
      if (!mapping || !config.externalItemId) {
        stores.push({
          storeId: config.storeId,
          uberStoreId: mapping?.uberStoreId ?? config.uberStoreId ?? null,
          status: 'SKIPPED_NOT_PUBLISHED',
        });
        continue;
      }

      await this.prisma.uberItemChannelConfig.update({
        where: {
          storeId_menuItemStableId: {
            storeId: config.storeId,
            menuItemStableId: input.menuItemStableId,
          },
        },
        data: { isAvailable: input.isAvailable },
      });
      try {
        // This integration currently supports Uber's asynchronous full-menu upload.
        // Every upload creates a durable publish version and is completed by the
        // notification handler or the polling confirmation task.
        const published = await this.publishUberMenu({
          storeId: config.storeId,
          dryRun: false,
          taxRateConfirmed: true,
          timezoneConfirmed: true,
        });
        stores.push({
          storeId: config.storeId,
          uberStoreId: mapping.uberStoreId,
          status: 'PENDING',
          versionStableId: published.versionStableId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.uberOpsTicket.create({
          data: {
            storeId: config.storeId,
            type: UberOpsTicketType.MENU_PUBLISH,
            status: UberOpsTicketStatus.OPEN,
            priority: UberOpsTicketPriority.HIGH,
            title: `Uber 商品可售状态同步失败：${input.menuItemStableId}`,
            description: '本地状态已保存；请重试整份菜单发布。',
            menuItemStableId: input.menuItemStableId,
            lastError: message,
            context: {
              uberStoreId: mapping.uberStoreId,
              externalItemId: config.externalItemId,
              isAvailable: input.isAvailable,
            },
          },
        });
        stores.push({
          storeId: config.storeId,
          uberStoreId: mapping.uberStoreId,
          status: 'FAILED',
          error: message,
        });
      }
    }

    const status: UberAvailabilitySyncStatus = stores.some(
      (store) => store.status === 'FAILED',
    )
      ? 'FAILED'
      : stores.some((store) => store.status === 'PENDING')
        ? 'PENDING'
        : 'SKIPPED_NOT_PUBLISHED';
    await this.captureEvent('ubereats_menu_item_availability_sync_requested', {
      menuItemStableId: input.menuItemStableId,
      isAvailable: input.isAvailable,
      status,
      stores,
    });
    return { status, stores };
  }

  async syncUberOptionItemAvailability(input: SyncOptionAvailabilityInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureOptionChoiceExists(input.optionChoiceStableId);

    const optionConfig = await this.prisma.uberOptionItemConfig.findUnique({
      where: {
        storeId_optionChoiceStableId: {
          storeId: normalizedStoreId,
          optionChoiceStableId: input.optionChoiceStableId,
        },
      },
    });

    if (!optionConfig) {
      throw new BadRequestException(
        `未找到 ${input.optionChoiceStableId} 的 Uber option 配置，请先配置`,
      );
    }

    const updated = await this.prisma.uberOptionItemConfig.update({
      where: {
        storeId_optionChoiceStableId: {
          storeId: normalizedStoreId,
          optionChoiceStableId: input.optionChoiceStableId,
        },
      },
      data: {
        isAvailable: input.isAvailable,
      },
      select: {
        optionChoiceStableId: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    await this.captureEvent('ubereats_option_item_availability_synced', {
      storeId: normalizedStoreId,
      optionChoiceStableId: input.optionChoiceStableId,
      isAvailable: updated.isAvailable,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: updated,
    };
  }

  async generateReconciliationReport(input: GenerateReconciliationReportInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    const range = this.resolveReportRange(input.rangeStart, input.rangeEnd);

    const [orders, failedSyncEvents, openTickets] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          channel: Channel.ubereats,
          createdAt: {
            gte: range.rangeStart,
            lt: range.rangeEnd,
          },
        },
        select: {
          status: true,
          totalCents: true,
        },
      }),
      this.prisma.opsEvent.count({
        where: {
          source: 'ubereats',
          eventName: {
            in: [
              'ubereats_order_sync_failed',
              'ubereats_menu_publish_failed',
              'ubereats_menu_item_availability_sync_failed',
            ],
          },
          createdAt: {
            gte: range.rangeStart,
            lt: range.rangeEnd,
          },
        },
      }),
      this.prisma.uberOpsTicket.count({
        where: {
          storeId: normalizedStoreId,
          status: {
            in: [UberOpsTicketStatus.OPEN, UberOpsTicketStatus.IN_PROGRESS],
          },
        },
      }),
    ]);

    const summary = {
      totalOrders: orders.length,
      totalAmountCents: orders.reduce((sum, row) => sum + row.totalCents, 0),
      syncedOrders: orders.filter((row) => row.status !== OrderStatus.pending)
        .length,
      pendingOrders: orders.filter((row) => row.status === OrderStatus.pending)
        .length,
      failedSyncEvents,
      discrepancyOrders: openTickets,
    };

    const payload: Prisma.JsonObject = {
      rangeStart: range.rangeStart.toISOString(),
      rangeEnd: range.rangeEnd.toISOString(),
      summary,
    };

    const report = await this.prisma.uberReconciliationReport.create({
      data: {
        storeId: normalizedStoreId,
        rangeStart: range.rangeStart,
        rangeEnd: range.rangeEnd,
        ...summary,
        payload,
      },
      select: {
        reportStableId: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_reconciliation_report_generated', {
      storeId: normalizedStoreId,
      reportStableId: report.reportStableId,
      ...summary,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      reportStableId: report.reportStableId,
      createdAt: report.createdAt,
      ...summary,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
    };
  }

  async listReconciliationReports(storeId?: string, limit = 20) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const take = Math.min(Math.max(1, Number(limit) || 20), 100);

    const rows = await this.prisma.uberReconciliationReport.findMany({
      where: { storeId: normalizedStoreId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        reportStableId: true,
        rangeStart: true,
        rangeEnd: true,
        totalOrders: true,
        totalAmountCents: true,
        failedSyncEvents: true,
        discrepancyOrders: true,
        createdAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: rows.length,
      items: rows,
    };
  }

  async createOpsTicket(input: CreateOpsTicketInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);

    if (input.externalOrderId) {
      await this.ensureUberOrderExists(input.externalOrderId);
    }
    if (input.menuItemStableId) {
      await this.ensureMenuItemExists(input.menuItemStableId);
    }

    const ticket = await this.prisma.uberOpsTicket.create({
      data: {
        storeId: normalizedStoreId,
        type: input.type,
        status: UberOpsTicketStatus.OPEN,
        priority: input.priority ?? UberOpsTicketPriority.MEDIUM,
        title: input.title,
        description: input.description,
        externalOrderId: input.externalOrderId,
        menuItemStableId: input.menuItemStableId,
        context: input.context,
      },
      select: {
        ticketStableId: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });

    await this.captureEvent('ubereats_ops_ticket_created', {
      storeId: normalizedStoreId,
      ticketStableId: ticket.ticketStableId,
      type: input.type,
      priority: ticket.priority,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      ...ticket,
    };
  }

  async listOpsTickets(storeId?: string, status?: UberOpsTicketStatus) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const rows = await this.prisma.uberOpsTicket.findMany({
      where: {
        storeId: normalizedStoreId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        ticketStableId: true,
        type: true,
        status: true,
        priority: true,
        title: true,
        externalOrderId: true,
        menuItemStableId: true,
        retryCount: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      storeId: normalizedStoreId,
      count: rows.length,
      items: rows,
    };
  }

  async retryOpsTicket(ticketStableId: string) {
    const ticket = await this.prisma.uberOpsTicket.findUnique({
      where: { ticketStableId },
    });

    if (!ticket) {
      throw new BadRequestException(`工单 ${ticketStableId} 不存在`);
    }

    let errorMessage: string | null = null;

    try {
      await this.prisma.uberOpsTicket.update({
        where: { ticketStableId },
        data: { status: UberOpsTicketStatus.IN_PROGRESS },
      });

      if (ticket.type === UberOpsTicketType.ORDER_STATUS_SYNC) {
        if (!ticket.externalOrderId) {
          throw new BadRequestException('订单状态同步工单缺少 externalOrderId');
        }
        await this.syncOrderStatusToUber(
          ticket.externalOrderId,
          OrderStatus.paid,
        );
      } else if (ticket.type === UberOpsTicketType.STORE_STATUS_SYNC) {
        await this.syncStoreStatusToUber();
      } else if (ticket.type === UberOpsTicketType.MENU_PUBLISH) {
        await this.publishUberMenu({ storeId: ticket.storeId, dryRun: false });
      } else if (ticket.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY) {
        if (!ticket.menuItemStableId) {
          throw new BadRequestException('商品状态工单缺少 menuItemStableId');
        }
        await this.syncUberMenuItemAvailability({
          storeId: ticket.storeId,
          menuItemStableId: ticket.menuItemStableId,
          isAvailable: true,
        });
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'unknown_error';
    }

    const updated = await this.prisma.uberOpsTicket.update({
      where: { ticketStableId },
      data: errorMessage
        ? {
            status: UberOpsTicketStatus.OPEN,
            retryCount: { increment: 1 },
            lastError: errorMessage,
          }
        : {
            status: UberOpsTicketStatus.RESOLVED,
            retryCount: { increment: 1 },
            lastError: null,
            resolvedAt: new Date(),
          },
      select: {
        ticketStableId: true,
        status: true,
        retryCount: true,
        lastError: true,
        resolvedAt: true,
      },
    });

    await this.captureEvent('ubereats_ops_ticket_retried', {
      ticketStableId,
      status: updated.status,
      retryCount: updated.retryCount,
      ...(updated.lastError ? { lastError: updated.lastError } : {}),
    });

    return {
      ok: !updated.lastError,
      ...updated,
    };
  }

  private createOAuthState(
    adminSessionId: string,
    merchantContext?: string,
  ): string {
    if (!adminSessionId.trim()) {
      throw new UnauthorizedException('缺少发起 OAuth 的管理员会话');
    }
    const timestamp = Date.now().toString();
    const nonce = randomBytes(32).toString('base64url');
    const payload = `${timestamp}.${nonce}`;
    const signature = createHmac('sha256', this.oauthStateSecret)
      .update(payload)
      .digest('hex');
    this.oauthStateRequests.set(nonce, {
      adminSessionId: adminSessionId.trim(),
      redirectUri: this.uberAuthService.getMerchantRedirectUri(),
      createdAt: Number(timestamp),
      merchantContext: merchantContext?.trim() || null,
    });
    return `${payload}.${signature}`;
  }

  private consumeOAuthState(
    state: string | undefined,
    adminSessionId: string | undefined,
  ) {
    const normalizedState = state?.trim();
    if (!normalizedState) {
      throw new BadRequestException('缺少 OAuth state');
    }

    const parts = normalizedState.split('.');
    if (parts.length !== 3) {
      throw new BadRequestException('OAuth state 非法');
    }

    const [timestamp, nonce, signature] = parts;
    if (!timestamp || !nonce || !signature) {
      throw new BadRequestException('OAuth state 非法');
    }

    const expected = createHmac('sha256', this.oauthStateSecret)
      .update(`${timestamp}.${nonce}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new BadRequestException('OAuth state 校验失败');
    }

    const issuedAt = Number(timestamp);
    if (!Number.isFinite(issuedAt)) {
      throw new BadRequestException('OAuth state 时间戳非法');
    }

    const now = Date.now();
    const maxAgeMs = 10 * 60 * 1000;
    if (issuedAt > now + 60_000) {
      throw new BadRequestException('OAuth state 时间戳来自未来');
    }
    if (now - issuedAt > maxAgeMs) {
      throw new BadRequestException('OAuth state 已过期');
    }

    const request = this.oauthStateRequests.get(nonce);
    if (!request || request.createdAt !== issuedAt) {
      throw new BadRequestException('OAuth state 不存在或已使用');
    }
    if (
      !adminSessionId?.trim() ||
      request.adminSessionId !== adminSessionId.trim()
    ) {
      throw new UnauthorizedException('OAuth state 与管理员会话不匹配');
    }

    // Map.delete 与前面的读取在同一个同步执行段完成；在任何异步 token 请求前消费 nonce。
    this.oauthStateRequests.delete(nonce);
    return request;
  }

  private async resolveMerchantConnection(
    merchantUberUserId?: string,
    accessToken?: string,
  ): Promise<UberMerchantConnectionRecord> {
    if (accessToken?.trim()) {
      return {
        merchantUberUserId: merchantUberUserId?.trim() || 'manual_token',
        accessToken: accessToken.trim(),
        refreshToken: null,
        expiresAt: null,
        scope: null,
        tokenType: 'Bearer',
        connectedAt: new Date(),
      };
    }

    const merchantConnection = this.uberMerchantConnectionDelegate;
    const row = merchantUberUserId?.trim()
      ? await merchantConnection?.findUnique({
          where: { merchantUberUserId: merchantUberUserId.trim() },
        })
      : await merchantConnection?.findFirst({
          orderBy: { connectedAt: 'desc' },
        });

    if (!row?.accessToken) {
      throw new BadRequestException(
        '未找到 Uber 商户授权，请先调用 /oauth/connect-url 和 /oauth/callback 完成授权',
      );
    }

    const now = Date.now();
    const skewMs = 60_000;
    const isExpired =
      !!row.expiresAt && row.expiresAt.getTime() <= now + skewMs;

    if (!isExpired) {
      return row;
    }

    if (!row.refreshToken) {
      throw new BadRequestException(
        'Uber 商户 access token 已过期，且缺少 refresh token，请重新授权',
      );
    }

    const refreshed = await this.uberAuthService.refreshMerchantAccessToken(
      row.refreshToken,
      row.scope ?? undefined,
    );

    const updated = await this.upsertMerchantConnection({
      merchantUberUserId: row.merchantUberUserId,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope,
      tokenType: refreshed.tokenType,
      connectedAt: row.connectedAt,
      rawStoresSnapshot: row.rawStoresSnapshot,
    });

    await this.captureEvent('ubereats_merchant_oauth_refreshed', {
      merchantUberUserId: row.merchantUberUserId,
      scope: refreshed.scope ?? '',
      tokenType: refreshed.tokenType ?? '',
      expiresAt: refreshed.expiresAt?.toISOString() ?? null,
    });

    return updated;
  }

  private upsertMerchantConnection(
    input: UberMerchantConnectionRecord,
  ): Promise<UberMerchantConnectionRecord> {
    const merchantConnection = this.uberMerchantConnectionDelegate;
    if (!merchantConnection) {
      throw new BadRequestException(
        'Prisma 未配置 uberMerchantConnection 模型',
      );
    }

    return merchantConnection.upsert({
      where: { merchantUberUserId: input.merchantUberUserId },
      create: input,
      update: {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
        connectedAt: input.connectedAt,
      },
    });
  }

  private async persistMerchantStores(
    merchantUberUserId: string,
    stores: UberMerchantStore[],
    raw: Record<string, unknown>,
  ) {
    const merchantConnection = this.uberMerchantConnectionDelegate;
    await merchantConnection?.update({
      where: { merchantUberUserId },
      data: { rawStoresSnapshot: raw },
    });

    await Promise.all(
      stores.map((store) =>
        this.upsertStoreDiscoverySnapshot({
          merchantUberUserId,
          uberStoreId: store.storeId,
          storeName: store.storeName,
          locationSummary: store.locationSummary,
          raw: store.raw,
        }),
      ),
    );
  }

  private async upsertStoreDiscoverySnapshot(input: {
    merchantUberUserId: string;
    uberStoreId: string;
    storeName?: string | null;
    locationSummary?: string | null;
    raw: unknown;
  }): Promise<void> {
    const rawPayload = this.asObject(input.raw) ?? {};
    const integrationEnabled = this.readStoreIntegrationEnabled(rawPayload);
    const posExternalStoreId = this.readStorePosExternalStoreId(rawPayload);
    const storeMapping = this.uberStoreMappingDelegate;
    if (!storeMapping) {
      throw new BadRequestException('Prisma 未配置 uberStoreMapping 模型');
    }

    await storeMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: {
        merchantUberUserId: input.merchantUberUserId,
        uberStoreId: input.uberStoreId,
        storeName: input.storeName ?? null,
        locationSummary: input.locationSummary ?? null,
        isProvisioned: integrationEnabled,
        provisionedAt: integrationEnabled ? new Date() : null,
        posExternalStoreId: posExternalStoreId ?? null,
        rawPayload,
      },
      update: {
        merchantUberUserId: input.merchantUberUserId,
        storeName: input.storeName ?? null,
        locationSummary: input.locationSummary ?? null,
        ...(integrationEnabled
          ? { isProvisioned: true, provisionedAt: new Date() }
          : {}),
        // Store discovery reports Uber's order-manager client id as the POS
        // external id. It is useful as an initial fallback, but it must not
        // overwrite the locally configured POS room used by printer clients.
        // An explicit provision operation remains authoritative and can still
        // update this field through upsertStoreMapping.
        rawPayload,
      },
    });
  }

  private upsertStoreMapping(
    input: UpsertStoreMappingInput,
  ): Promise<UberStoreMappingRecord> {
    const storeMapping = this.uberStoreMappingDelegate;
    if (!storeMapping) {
      throw new BadRequestException('Prisma 未配置 uberStoreMapping 模型');
    }

    return storeMapping.upsert({
      where: { uberStoreId: input.uberStoreId },
      create: {
        merchantUberUserId: input.merchantUberUserId,
        uberStoreId: input.uberStoreId,
        storeName: input.storeName,
        locationSummary: input.locationSummary,
        isProvisioned: input.isProvisioned,
        provisionedAt: input.isProvisioned ? new Date() : null,
        posExternalStoreId: input.posExternalStoreId,
        rawPayload: input.raw,
      },
      update: {
        merchantUberUserId: input.merchantUberUserId,
        storeName: input.storeName,
        locationSummary: input.locationSummary,
        isProvisioned: input.isProvisioned,
        provisionedAt: input.isProvisioned ? new Date() : undefined,
        posExternalStoreId: input.posExternalStoreId,
        rawPayload: input.raw,
      },
    });
  }

  private async callUberApi(
    path: string,
    options: {
      accessToken: string;
      method: 'GET' | 'POST' | 'PUT';
      body?: Record<string, unknown>;
      rawBody?: string | Buffer;
      extraHeaders?: Record<string, string>;
    },
  ): Promise<Record<string, unknown>> {
    const resolvedBody: BodyInit | undefined =
      options.rawBody !== undefined
        ? typeof options.rawBody === 'string'
          ? options.rawBody
          : new Uint8Array(options.rawBody)
        : options.body
          ? JSON.stringify(options.body)
          : undefined;
    const response = await fetch(
      `${this.uberApiBaseUrl.replace(/\/$/, '')}${path}`,
      {
        method: options.method,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          Accept: 'application/json',
          ...(options.body && !options.rawBody
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(options.extraHeaders ?? {}),
        },
        ...(resolvedBody !== undefined ? { body: resolvedBody } : {}),
      },
    );

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText);
    if (!response.ok) {
      const authenticationError =
        response.status === 401 || response.status === 403
          ? this.buildUberAuthenticationError(parsed, response.status)
          : undefined;
      const detail = authenticationError
        ? JSON.stringify(authenticationError)
        : this.summarizeDebugResponse(parsed, rawText);
      this.logger.error(
        `[ubereats api] ${options.method} ${path} failed status=${response.status} detail=${JSON.stringify(detail)}`,
      );
      throw new BadRequestException({
        ok: false,
        status: response.status,
        detail,
        ...(authenticationError ? { error: authenticationError } : {}),
      });
    }

    return this.asObject(parsed) ?? {};
  }

  private extractMerchantStores(
    payload: Record<string, unknown>,
  ): UberMerchantStore[] {
    const candidates = [
      payload.stores,
      payload.data,
      this.asObject(payload.data)?.stores,
    ];
    const storesNode = candidates.find((value) => Array.isArray(value));
    if (!Array.isArray(storesNode)) return [];

    return storesNode
      .map((item) => this.asObject(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .map((store) => ({
        storeId:
          this.readString(store.store_id, store.id, store.uuid) ||
          `unknown:${randomUUID()}`,
        storeName: this.readString(store.name, store.store_name),
        locationSummary: this.readLocationSummary(store),
        integrationEnabled: this.readStoreIntegrationEnabled(store),
        posExternalStoreId: this.readStorePosExternalStoreId(store),
        timezone: this.readUberStoreTimezone(store),
        raw: store,
      }));
  }

  private readStoreIntegrationEnabled(payload: unknown): boolean {
    const store = this.asObject(payload);
    const posData = this.asObject(store?.pos_data);
    return posData?.integration_enabled === true;
  }

  private readStorePosExternalStoreId(payload: unknown): string | null {
    const store = this.asObject(payload);
    const posData = this.asObject(store?.pos_data);

    return this.readString(
      posData?.order_manager_client_id,
      posData?.pos_external_store_id,
      store?.pos_external_store_id,
    );
  }

  private readLocationSummary(payload: unknown): string | null {
    const root = this.asObject(payload);
    const location =
      this.asObject(root?.location) ?? this.asObject(root?.address);

    return this.readString(
      root?.location_summary,
      location?.formatted_address,
      [location?.address_line_one, location?.city, location?.country]
        .filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
        .join(', '),
    );
  }

  private async handleOrderWebhook(
    eventType: string,
    eventId: string,
    envelope: UberWebhookEnvelopeDto | null,
  ) {
    if (!envelope) {
      throw new BadRequestException('Uber 订单 webhook envelope 无效');
    }

    const resourceUrl = this.validateOrderResourceHref(envelope.resourceHref);
    const token = await this.uberAuthService.getAccessToken(
      'eats.store.orders.read',
    );
    const orderPayload = await this.fetchUberOrderDetail(resourceUrl, token, {
      eventType,
      eventId,
      resourceId: envelope.resourceId,
    });

    const parsedOrder = this.parseOrderPayload(orderPayload);

    if (!parsedOrder) {
      const externalOrderId = envelope.resourceId;
      if (externalOrderId) {
        await this.autoDenyUberOrderForWebhook(
          externalOrderId,
          'INVALID_ORDER',
          '订单详情无法解析',
          { eventType, eventId },
        );
      }
      return;
    }

    const config = await this.ensureBusinessConfig();
    if (config.isTemporarilyClosed) {
      await this.autoDenyUberOrderForWebhook(
        parsedOrder.externalOrderId,
        'STORE_CLOSED',
        config.temporaryCloseReason ?? '门店暂停营业',
        { eventType, eventId },
      );
      return;
    }

    let order: {
      action: 'created' | 'updated';
      status: OrderStatus;
      orderId: string;
      orderStableId: string;
    };
    try {
      order = await this.upsertUberOrder(parsedOrder, eventType, eventId);
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message.includes('菜单映射')
      ) {
        await this.autoDenyUberOrderForWebhook(
          parsedOrder.externalOrderId,
          'ITEM_UNAVAILABLE',
          error.message,
          { eventType, eventId },
        );
        return;
      }
      // Database/local infrastructure errors deliberately remain pending so
      // the webhook/job can retry; accepting before commit would lose orders.
      throw error;
    }

    if (
      order.action === 'created' &&
      order.status === OrderStatus.paid &&
      this.normalizeEventType(eventType) === 'orders.notification'
    ) {
      this.orderEventsBus?.emitOrderPaidVerified({
        orderId: order.orderId,
        amountCents: Math.max(
          0,
          parsedOrder.subtotalCents - parsedOrder.discountCents,
        ),
        redeemValueCents: 0,
      });
    }

    await this.enqueueAndBestEffortAcceptUberOrder(
      parsedOrder.externalOrderId,
      {
        eventType,
        eventId,
        orderStableId: order.orderStableId,
      },
    );

    await this.captureEvent('ubereats_webhook_processed', {
      eventType,
      eventId,
      externalOrderId: parsedOrder.externalOrderId,
      orderStableId: order.orderStableId,
      storeId: parsedOrder.storeId ?? this.normalizeStoreId(undefined),
    });
  }

  private async autoDenyUberOrderForWebhook(
    externalOrderId: string,
    reasonCode: string,
    reasonDetail: string,
    context: { eventType: string; eventId: string },
  ) {
    try {
      await this.denyUberOrder(externalOrderId, reasonCode, reasonDetail);
    } catch (error) {
      const response =
        error instanceof BadGatewayException ? error.getResponse() : null;
      const responseObject = this.asObject(response);
      const status =
        typeof responseObject?.status === 'number'
          ? responseObject.status
          : undefined;
      const retryable = responseObject?.retryable === true;
      const detail = this.readString(responseObject?.detail);

      if (
        status !== undefined &&
        this.isNonRetryableOrderActionStatus(status) &&
        !retryable
      ) {
        const redactedDetail = detail
          ? this.redactSensitiveLogText(detail)
          : undefined;
        this.logger.warn(
          `[ubereats webhook deny] non-retryable upstream failure swallowed externalOrderId=${externalOrderId} eventType=${context.eventType} eventId=${context.eventId} status=${status} retryable=false detail=${redactedDetail ?? 'unknown'}`,
        );
        await this.captureEvent('ubereats_webhook_auto_deny_failed', {
          externalOrderId,
          eventType: context.eventType,
          eventId: context.eventId,
          reasonCode,
          status,
          retryable: false,
          ...(redactedDetail ? { detail: redactedDetail } : {}),
        });
        return;
      }

      throw error;
    }
  }

  private isNonRetryableOrderActionStatus(status: number): boolean {
    return [400, 401, 403, 404].includes(status);
  }

  private async enqueueAndBestEffortAcceptUberOrder(
    externalOrderId: string,
    context: {
      eventType: string;
      eventId: string;
      orderStableId: string;
    },
  ) {
    await this.uberOrderActionDelegate.upsert({
      where: { externalOrderId_action: { externalOrderId, action: 'ACCEPT' } },
      create: {
        externalOrderId,
        action: 'ACCEPT',
        status: 'PENDING',
        reasonCode: 'accepted',
      },
      update: {},
    });

    try {
      await this.executeUberOrderAction(
        externalOrderId,
        'ACCEPT',
        { reason: 'accepted' },
        true,
      );
    } catch (error) {
      const response =
        error instanceof BadGatewayException ? error.getResponse() : null;
      const responseObject = this.asObject(response);
      const retryable = responseObject?.retryable === true;
      const status =
        typeof responseObject?.status === 'number'
          ? responseObject.status
          : error instanceof BadGatewayException
            ? error.getStatus()
            : undefined;
      const detail = this.readString(responseObject?.detail);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `[ubereats webhook accept] best-effort accept failed externalOrderId=${externalOrderId} eventId=${context.eventId} retryable=${retryable} status=${status ?? 'unknown'} error=${this.redactSensitiveLogText(detail || errorMessage)}`,
      );

      await this.captureEvent(
        retryable
          ? 'ubereats_order_accept_retry_queued'
          : 'ubereats_order_accept_manual_review_required',
        {
          externalOrderId,
          eventType: context.eventType,
          eventId: context.eventId,
          orderStableId: context.orderStableId,
          retryable,
          ...(status !== undefined ? { status } : {}),
          ...(detail ? { detail: this.redactSensitiveLogText(detail) } : {}),
        },
      );
    }
  }

  private async fetchUberOrderDetail(
    resourceUrl: string,
    token: string,
    context: {
      eventType: string;
      eventId: string;
      resourceId?: string | null;
    },
  ): Promise<unknown> {
    let response = await this.requestUberOrderDetail(resourceUrl, token);
    let rawText = await response.text();
    let parsed = this.tryParseJson(rawText);

    if (
      (response.status === 401 || response.status === 403) &&
      typeof this.uberAuthService.forceRefreshAccessToken === 'function'
    ) {
      const refreshedToken = await this.uberAuthService.forceRefreshAccessToken(
        'eats.store.orders.read',
      );
      response = await this.requestUberOrderDetail(resourceUrl, refreshedToken);
      rawText = await response.text();
      parsed = this.tryParseJson(rawText);
    }

    if (response.ok) {
      return parsed;
    }

    const authenticationError =
      response.status === 401 || response.status === 403
        ? this.buildUberAuthenticationError(parsed, response.status)
        : undefined;
    const detail = authenticationError
      ? JSON.stringify(authenticationError)
      : this.summarizeDebugResponse(parsed, rawText);
    const resource = new URL(resourceUrl);
    const uberRequestId =
      response.headers.get('x-uber-request-id') ??
      response.headers.get('x-request-id') ??
      response.headers.get('trace-id');

    this.logger.error(
      `[ubereats order] detail fetch failed status=${response.status} eventType=${context.eventType} eventId=${context.eventId} resourceId=${context.resourceId ?? 'unknown'} resourceUrl=${resource.origin}${resource.pathname} uberRequestId=${uberRequestId ?? 'unknown'} detail=${this.redactSensitiveLogText(detail)}`,
    );

    const payload = {
      ok: false,
      status: response.status,
      message: 'Uber 订单详情接口返回错误',
      detail,
      ...(authenticationError ? { error: authenticationError } : {}),
    };

    if (this.isNonRetryableOrderDetailStatus(response.status)) {
      throw new UberWebhookNonRetryableError(
        JSON.stringify(payload),
        response.status,
        detail,
      );
    }

    throw new BadGatewayException(payload);
  }

  private async requestUberOrderDetail(
    resourceUrl: string,
    token: string,
  ): Promise<Response> {
    try {
      return await fetch(resourceUrl, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      throw new BadGatewayException({
        ok: false,
        message: '下载 Uber 订单详情失败',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isNonRetryableOrderDetailStatus(status: number): boolean {
    return [400, 401, 403, 404].includes(status);
  }

  private async executeUberOrderAction(
    externalOrderId: string,
    action: UberOrderActionName,
    payload: Record<string, unknown>,
    processPending = false,
    audit?: { reasonCode?: string; reasonDetail?: string },
  ) {
    if (!externalOrderId) {
      throw new BadRequestException('externalOrderId 不能为空');
    }
    const delegate = this.uberOrderActionDelegate;
    const key = { externalOrderId, action };
    let record = await delegate.findUnique({
      where: { externalOrderId_action: key },
    });
    if (
      record?.status === 'SUCCEEDED' ||
      (record?.status === 'PENDING' && !processPending)
    ) {
      if (action === 'ACCEPT' && record.status === 'SUCCEEDED') {
        await this.advanceLocalUberOrderStatusAfterAccept(externalOrderId);
      }
      return this.toUberOrderActionResult(record, true);
    }
    if (record && !record.retryable && !processPending) {
      return this.toUberOrderActionResult(record, true);
    }
    if (!record) {
      try {
        record = await delegate.create({
          data: {
            ...key,
            status: 'PENDING',
            reasonCode: audit?.reasonCode ?? this.readString(payload.reason),
            reasonDetail:
              audit?.reasonDetail ?? this.readString(payload.details),
            attemptCount: 1,
          },
        });
      } catch (error) {
        if (this.readString(this.asObject(error)?.code) !== 'P2002')
          throw error;
        record = await delegate.findUnique({
          where: { externalOrderId_action: key },
        });
        if (!record) throw error;
        return this.toUberOrderActionResult(record, true);
      }
    } else {
      record = await delegate.update({
        where: { id: record.id },
        data: {
          status: 'PENDING',
          retryable: false,
          attemptCount: { increment: 1 },
        },
      });
    }

    const encodedOrderId = encodeURIComponent(externalOrderId);
    const pathnameByAction: Record<UberOrderActionName, string> = {
      ACCEPT: `/v1/eats/orders/${encodedOrderId}/accept_pos_order`,
      DENY: `/v1/eats/orders/${encodedOrderId}/deny_pos_order`,
      READY_FOR_PICKUP: `/v1/delivery/order/${encodedOrderId}/ready`,
    };
    const pathname = pathnameByAction[action];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      const token = await this.uberAuthService.getAccessToken('eats.order');
      response = await fetch(
        `${this.uberApiBaseUrl.replace(/\/$/, '')}${pathname}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.name : typeof error;
      const redactedError = this.redactSensitiveLogText(errorMessage);
      await delegate.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          retryable: true,
          lastError: redactedError
            .replace(/(token|secret|authorization)=?[^\s&]*/gi, '$1=[REDACTED]')
            .slice(0, 2_000),
          response: this.redactUberResponse({
            error: errorMessage,
          }),
        },
      });
      this.logger.error(
        `[ubereats order action] request failed action=${action} externalOrderId=${externalOrderId} endpoint=${pathname} errorType=${errorType} error=${redactedError}`,
      );
      if (action !== 'READY_FOR_PICKUP') {
        throw new BadGatewayException({
          ok: false,
          externalOrderId,
          action,
          endpoint: pathname,
          retryable: true,
          message: 'Uber 订单动作网络请求失败或超时',
          detail: redactedError,
        });
      }
      return {
        ok: false,
        action,
        actionId: record.id,
        status: 'FAILED' as const,
        retryable: true,
        duplicate: false,
        errorSummary: 'Uber 订单动作网络请求失败或超时',
      };
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText);
    // Uber may answer 409 when a retried ready action has already won upstream.
    const succeeded =
      response.ok || (action === 'READY_FOR_PICKUP' && response.status === 409);
    const retryable = response.status === 429 || response.status >= 500;
    const uberRequestId =
      response.headers.get('x-request-id') ??
      response.headers.get('uber-request-id');
    await delegate.update({
      where: { id: record.id },
      data: {
        status: succeeded ? 'SUCCEEDED' : 'FAILED',
        uberHttpStatus: response.status,
        retryable,
        uberRequestId,
        lastError: succeeded
          ? null
          : this.summarizeDebugResponse(parsed, rawText).slice(0, 2_000),
        response: this.redactUberResponse(
          parsed ?? { body: rawText.slice(0, 2_000) },
        ),
        ...(succeeded ? { completedAt: new Date() } : {}),
      },
    });
    if (!succeeded) {
      this.logger.error(
        `[ubereats order action] upstream failed action=${action} externalOrderId=${externalOrderId} endpoint=${pathname} status=${response.status} retryable=${retryable} uberRequestId=${uberRequestId ?? 'unknown'} detail=${this.redactSensitiveLogText(this.summarizeDebugResponse(parsed, rawText))}`,
      );
      if (action !== 'READY_FOR_PICKUP') {
        throw new BadGatewayException({
          ok: false,
          externalOrderId,
          action,
          endpoint: pathname,
          status: response.status,
          uberRequestId,
          retryable,
          detail: this.redactSensitiveLogText(
            this.summarizeDebugResponse(parsed, rawText),
          ),
        });
      }
      return {
        ok: false,
        action,
        actionId: record.id,
        status: 'FAILED' as const,
        retryable,
        duplicate: false,
        uberHttpStatus: response.status,
        errorSummary: `Uber 返回 HTTP ${response.status}`,
      };
    }
    if (action === 'ACCEPT') {
      await this.advanceLocalUberOrderStatusAfterAccept(externalOrderId);
    }
    return {
      ok: true,
      duplicate: false,
      action,
      actionId: record.id,
      status: 'SUCCEEDED' as const,
      retryable: false,
      uberHttpStatus: response.status,
    };
  }

  private toUberOrderActionResult(
    record: UberOrderActionRecord,
    duplicate: boolean,
  ): UberOrderActionResult {
    const status = record.status as UberOrderActionResult['status'];
    return {
      ok: status === 'SUCCEEDED',
      action: record.action,
      actionId: record.id,
      status,
      retryable: record.retryable,
      duplicate,
      uberHttpStatus: record.uberHttpStatus,
      ...(record.lastError ? { errorSummary: 'Uber 同步失败' } : {}),
    };
  }

  private async advanceLocalUberOrderStatusAfterAccept(
    externalOrderId: string,
  ): Promise<void> {
    if (this.orderIngestionService) {
      await this.orderIngestionService.markAccepted(
        this.toClientRequestId(externalOrderId),
      );
      return;
    }
    const orderDelegate = this.prisma.order as unknown as {
      findUnique?: (args: {
        where: { clientRequestId: string };
        select: { id: true; orderStableId: true; status: true; paidAt: true };
      }) => Promise<{
        id: string;
        orderStableId: string | null;
        status: OrderStatus;
        paidAt: Date | null;
      } | null>;
      updateMany?: (args: {
        where: { id: string; status: { in: OrderStatus[] } };
        data: { status: OrderStatus; paidAt?: Date; makingAt?: Date };
      }) => Promise<{ count: number }>;
    };
    if (
      typeof orderDelegate.findUnique !== 'function' ||
      typeof orderDelegate.updateMany !== 'function'
    ) {
      return;
    }

    const clientRequestId = this.toClientRequestId(externalOrderId);
    const existing = await orderDelegate.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true, status: true, paidAt: true },
    });

    if (
      !existing ||
      (existing.status !== OrderStatus.pending &&
        existing.status !== OrderStatus.paid)
    ) {
      return;
    }

    const advancedAt = new Date();
    const targetStatus = OrderStatus.making;
    const result = await orderDelegate.updateMany({
      where: {
        id: existing.id,
        status: { in: [OrderStatus.pending, OrderStatus.paid] },
      },
      data: {
        status: targetStatus,
        paidAt: existing.paidAt ?? advancedAt,
        makingAt: advancedAt,
      },
    });

    if (result.count === 0) {
      return;
    }

    if (existing.orderStableId) {
      this.orderEventsBus?.emitOrderAccepted({
        orderId: existing.id,
        stableId: existing.orderStableId,
      });
    }
  }

  private redactUberResponse(value: unknown): Prisma.InputJsonValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactUberResponse(item));
    }
    const object = this.asObject(value);
    if (!object) {
      if (typeof value === 'string') {
        return value
          .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
          .replace(/\b(token|password|secret)=([^\s&]+)/gi, '$1=[REDACTED]')
          .slice(0, 2_000);
      }
      return (value === undefined ? null : value) as Prisma.InputJsonValue;
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [
        key,
        /token|authorization|phone|email|address|name/i.test(key)
          ? '[REDACTED]'
          : this.redactUberResponse(item),
      ]),
    );
  }

  private validateOrderResourceHref(resourceHref: string): string {
    return this.buildUberApiUrlFromResourceHref(resourceHref);
  }

  private buildUberApiUrlFromResourceHref(resourceHref: string): string {
    let resource: URL;
    let base: URL;
    try {
      resource = new URL(resourceHref);
      base = new URL(this.uberApiBaseUrl);
    } catch {
      throw new BadRequestException('Uber resource_href 无效');
    }

    const allowedOrigins = this.parseUberResourceHrefAllowedOrigins();
    if (
      !allowedOrigins.has(resource.origin) ||
      resource.username ||
      resource.password
    ) {
      this.logger.warn(
        'ubereats webhook resource_href rejected ' +
          `resourceOrigin=${resource.origin} ` +
          `resourcePathname=${resource.pathname} ` +
          `allowedOrigins=${[...allowedOrigins].join(',') || 'none'} ` +
          `uberApiOrigin=${base.origin}`,
      );
      throw new BadRequestException('Uber resource_href 不属于允许的来源');
    }

    const mappedUrl = new URL(base.origin);
    mappedUrl.pathname = resource.pathname;
    mappedUrl.search = resource.search;
    return mappedUrl.toString();
  }

  private parseUberResourceHrefAllowedOrigins(): Set<string> {
    const origins = this.uberResourceHrefAllowedOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => Boolean(origin));

    return new Set(origins);
  }

  private async handleMenuNotificationWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const notification = UberMenuNotificationDto.parse(payload);
    if (!notification) {
      await this.captureEvent('ubereats_menu_notification_invalid', {
        eventType,
        eventId,
      });
      return;
    }
    const candidates = await this.prisma.uberMenuPublishVersion.findMany({
      where: {
        uberStoreId: notification.storeId,
        status: {
          in: [
            UberMenuPublishStatus.SUBMITTED,
            UberMenuPublishStatus.SUCCEEDED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        versionStableId: true,
        requestPayload: true,
        responsePayload: true,
        status: true,
      },
    });
    const version = candidates.find((candidate) =>
      this.menuVersionHasResourceId(candidate, notification.resourceId),
    );
    const errors = version
      ? this.mapMenuPublishErrors(notification.failures, version.requestPayload)
      : notification.failures;

    if (
      version &&
      notification.status === 'SUCCEEDED' &&
      version.status !== UberMenuPublishStatus.SUCCEEDED
    ) {
      await this.markMenuPublishVersionSuccess(version.id, {
        resource_id: notification.resourceId,
        status: notification.status,
      });
    } else if (version && notification.status === 'FAILED') {
      await this.markMenuPublishVersionFailed(
        version.id,
        errors.map((error) => error.message).join('; ') || 'Uber 菜单处理失败',
        errors,
      );
    }

    await this.captureEvent('ubereats_menu_notification_processed', {
      eventType,
      eventId,
      uberStoreId: notification.storeId,
      resourceId: notification.resourceId,
      status: notification.status,
      matchedVersion: Boolean(version),
      errors: errors as unknown as Prisma.JsonArray,
    });
  }

  private menuVersionHasResourceId(
    version: {
      versionStableId: string;
      requestPayload: unknown;
      responsePayload: unknown;
    },
    resourceId: string,
  ) {
    if (version.versionStableId === resourceId) return true;
    const response = this.asObject(version.responsePayload);
    if (this.readString(response?.resource_id, response?.id) === resourceId)
      return true;
    const request = this.asObject(version.requestPayload);
    const menus = Array.isArray(request?.menus) ? request.menus : [];
    return menus.some(
      (menu) => this.readString(this.asObject(menu)?.id) === resourceId,
    );
  }

  private mapMenuPublishErrors(
    errors: UberMenuPublishError[],
    requestPayload: unknown,
  ): UberMenuPublishError[] {
    const payload = this.asObject(requestPayload);
    return errors.map((error) => {
      const match = error.path?.match(
        /(?:^|\.)(items|categories|modifier_groups)\[(\d+)\]/,
      );
      if (!match) return error;
      const collection = Array.isArray(payload?.[match[1]])
        ? (payload?.[match[1]] as unknown[])
        : [];
      const localId = this.readString(
        this.asObject(collection[Number(match[2])])?.id,
      );
      return localId
        ? {
            ...error,
            entityType:
              match[1] === 'items'
                ? 'item'
                : match[1] === 'categories'
                  ? 'category'
                  : 'modifier',
            localId,
          }
        : error;
    });
  }

  private extractMenuPublishErrors(payload: unknown): UberMenuPublishError[] {
    const root = this.asObject(payload) ?? {};
    const failure = this.asObject(root.failure_info) ?? {};
    const candidates = [root.errors, failure.errors, root.error];
    const values = candidates.flatMap<unknown>((candidate) =>
      Array.isArray(candidate)
        ? (candidate as unknown[])
        : candidate
          ? [candidate]
          : [],
    );

    return values.map((value) => {
      const error = this.asObject(value) ?? {};
      return {
        code:
          this.readString(error.code, error.error_code) ?? 'UBER_MENU_ERROR',
        path: this.readString(
          error.path,
          error.field_path,
          error.field,
          error.location,
        ),
        message:
          this.readString(error.message, error.description, error.detail) ??
          'Uber 未提供错误说明',
      };
    });
  }

  private async handleStoreProvisionedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    if (storeId) {
      await this.updateStoreProvisioningState(storeId, true);
    }

    await this.captureEvent('ubereats_store_provisioned', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async handleStoreDeprovisionedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    if (storeId) {
      await this.updateStoreProvisioningState(storeId, false);
    }

    await this.captureEvent('ubereats_store_deprovisioned', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async handleStoreStatusChangedWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const storeId = this.extractStoreId(payload);

    await this.captureEvent('ubereats_store_status_changed', {
      eventType,
      eventId,
      storeId: storeId ?? 'unknown',
    });
  }

  private async updateStoreProvisioningState(
    storeId: string,
    isProvisioned: boolean,
  ): Promise<void> {
    const storeMapping = this.uberStoreMappingDelegate;
    if (!storeMapping) {
      throw new BadRequestException('Prisma 未配置 uberStoreMapping 模型');
    }

    const updated = await storeMapping.updateMany({
      where: { uberStoreId: storeId },
      data: {
        isProvisioned,
        provisionedAt: isProvisioned ? new Date() : null,
      },
    });

    if (!updated.count) {
      this.logger.warn(
        `[ubereats webhook] store mapping not found for provisioning update storeId=${storeId} isProvisioned=${isProvisioned}`,
      );
    }
  }

  private resolveReportRange(rangeStart?: string, rangeEnd?: string) {
    const end = rangeEnd ? new Date(rangeEnd) : new Date();
    const start = rangeStart
      ? new Date(rangeStart)
      : new Date(end.getTime() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('对账时间范围格式不正确');
    }

    if (start >= end) {
      throw new BadRequestException('对账时间范围不合法：start 必须早于 end');
    }

    return {
      rangeStart: start,
      rangeEnd: end,
    };
  }

  private async ensureUberOrderExists(externalOrderId: string) {
    const row = await this.prisma.order.findUnique({
      where: {
        clientRequestId: this.toClientRequestId(externalOrderId),
      },
      select: { id: true },
    });

    if (!row) {
      throw new BadRequestException(`Uber 订单 ${externalOrderId} 不存在`);
    }
  }

  private async buildUberMenuGraph(storeId: string, uberStoreId: string) {
    const excludedCategoryIds = new Set<string>();
    const excludedGroupIds = new Set<string>();
    const excludedMenuItemStableIds = new Set<string>();
    const excludedOptionChoiceStableIds = new Set<string>();
    return this.buildUberMenuGraphWithFilters(storeId, uberStoreId, {
      excludedCategoryIds,
      excludedGroupIds,
      excludedMenuItemStableIds,
      excludedOptionChoiceStableIds,
    });
  }

  private composeUberDisplayName(
    nameEn?: string | null,
    nameZh?: string | null,
  ) {
    const en = (nameEn ?? '').trim();
    const zh = (nameZh ?? '').trim();
    if (en && zh) return `${en} ${zh}`;
    return en || zh;
  }

  private async buildUberMenuGraphWithFilters(
    storeId: string,
    uberStoreId: string,
    filters: {
      excludedCategoryIds: Set<string>;
      excludedGroupIds: Set<string>;
      excludedMenuItemStableIds: Set<string>;
      excludedOptionChoiceStableIds: Set<string>;
    },
  ) {
    const [
      categories,
      menuItems,
      templates,
      itemConfigs,
      optionConfigs,
      modifierGroupConfigs,
      categoryConfigs,
      childGroupBindings,
    ] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          stableId: true,
          nameEn: true,
          nameZh: true,
          sortOrder: true,
          isActive: true,
        },
      }),
      this.prisma.menuItem.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishToUberEats: true,
        },
        select: {
          id: true,
          stableId: true,
          categoryId: true,
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          sortOrder: true,
          imageUrl: true,
          ingredientsEn: true,
          optionGroups: {
            where: { isEnabled: true },
            select: {
              templateGroup: { select: { stableId: true } },
              sortOrder: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.menuOptionGroupTemplate.findMany({
        where: { deletedAt: null },
        select: {
          stableId: true,
          nameEn: true,
          nameZh: true,
          defaultMinSelect: true,
          defaultMaxSelect: true,
          isAvailable: true,
          sortOrder: true,
          options: {
            where: { deletedAt: null },
            select: {
              stableId: true,
              nameEn: true,
              nameZh: true,
              priceDeltaCents: true,
              isAvailable: true,
              sortOrder: true,
              childLinks: {
                select: {
                  childOption: {
                    select: { templateGroup: { select: { stableId: true } } },
                  },
                },
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.uberItemChannelConfig.findMany({
        where: { storeId },
        select: {
          menuItemStableId: true,
          priceCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.prisma.uberOptionItemConfig.findMany({
        where: { storeId },
        select: {
          optionChoiceStableId: true,
          priceDeltaCents: true,
          isAvailable: true,
          displayName: true,
          displayDescription: true,
        },
      }),
      this.prisma.uberModifierGroupConfig.findMany({
        where: { storeId },
        select: {
          templateGroupStableId: true,
          displayName: true,
          minSelect: true,
          maxSelect: true,
          isActive: true,
        },
      }),
      this.prisma.uberCategoryConfig.findMany({
        where: { storeId },
        select: {
          menuCategoryStableId: true,
          displayName: true,
          sortOrder: true,
          isActive: true,
        },
      }),
      this.prisma.uberOptionChildGroupBinding.findMany({
        where: { storeId },
        select: {
          parentOptionChoiceStableId: true,
          childTemplateGroupStableId: true,
          isBound: true,
        },
      }),
    ]);

    const categoryConfigMap = new Map(
      categoryConfigs.map((config) => [config.menuCategoryStableId, config]),
    );
    const itemConfigMap = new Map(
      itemConfigs.map((item) => [item.menuItemStableId, item]),
    );
    const optionConfigMap = new Map(
      optionConfigs.map((config) => [config.optionChoiceStableId, config]),
    );
    const groupConfigMap = new Map(
      modifierGroupConfigs.map((config) => [
        config.templateGroupStableId,
        config,
      ]),
    );
    const childGroupBindingMap = new Map<
      string,
      Array<{ childTemplateGroupStableId: string; isBound: boolean }>
    >();
    for (const binding of childGroupBindings) {
      const list =
        childGroupBindingMap.get(binding.parentOptionChoiceStableId) ?? [];
      list.push({
        childTemplateGroupStableId: binding.childTemplateGroupStableId,
        isBound: binding.isBound,
      });
      childGroupBindingMap.set(binding.parentOptionChoiceStableId, list);
    }
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );

    const groupDraftMap = new Map<
      string,
      {
        id: string;
        sourceStableId: string;
        title: string;
        minSelect: number;
        maxSelect: number;
        isAvailable: boolean;
        optionItemIds: string[];
      }
    >();

    const optionItemDraftMap = new Map<
      string,
      {
        id: string;
        sourceType: 'OPTION_ITEM';
        sourceStableId: string;
        title: string;
        description: string | null;
        basePriceCents: number;
        priceCents: number;
        isAvailable: boolean;
        modifierGroupIds: string[];
        hasDelta: boolean;
        imageUrl: string | null;
      }
    >();

    const itemDrafts: Array<{
      id: string;
      sourceType: 'MENU_ITEM';
      sourceStableId: string;
      title: string;
      description: string | null;
      basePriceCents: number;
      priceCents: number;
      isAvailable: boolean;
      modifierGroupIds: string[];
      categoryStableId: string;
      sortOrder: number;
      hasDelta: boolean;
      imageUrl: string | null;
    }> = [];

    for (const template of templates) {
      const groupConfig = groupConfigMap.get(template.stableId);
      const groupId = this.buildStableUberNodeId(
        'group',
        storeId,
        template.stableId,
      );
      if (filters.excludedGroupIds.has(groupId)) {
        continue;
      }
      const optionItemIds: string[] = [];
      const minSelect = groupConfig?.minSelect ?? template.defaultMinSelect;
      const maxSelect =
        groupConfig?.maxSelect ??
        template.defaultMaxSelect ??
        Math.max(template.options.length, minSelect, 1);
      const groupIsActive = groupConfig?.isActive ?? template.isAvailable;
      if (!groupIsActive) {
        continue;
      }

      for (const choice of template.options) {
        if (filters.excludedOptionChoiceStableIds.has(choice.stableId)) {
          continue;
        }
        const optionConfig = optionConfigMap.get(choice.stableId);
        const optionItemId = this.buildStableUberNodeId(
          'item',
          storeId,
          choice.stableId,
        );
        const optionAvailable =
          optionConfig?.isAvailable !== undefined
            ? optionConfig.isAvailable
            : choice.isAvailable;
        const optionPriceCents =
          optionConfig?.priceDeltaCents ?? choice.priceDeltaCents;
        const sourceChildGroupStableIds = new Set(
          choice.childLinks.map(
            (link) => link.childOption.templateGroup.stableId,
          ),
        );
        const bindings = childGroupBindingMap.get(choice.stableId) ?? [];
        for (const binding of bindings) {
          if (binding.isBound) {
            sourceChildGroupStableIds.add(binding.childTemplateGroupStableId);
          } else {
            sourceChildGroupStableIds.delete(
              binding.childTemplateGroupStableId,
            );
          }
        }
        const childGroupIds = Array.from(sourceChildGroupStableIds).map(
          (childTemplateGroupStableId) =>
            this.buildStableUberNodeId(
              'group',
              storeId,
              childTemplateGroupStableId,
            ),
        );

        optionItemIds.push(optionItemId);
        optionItemDraftMap.set(choice.stableId, {
          id: optionItemId,
          sourceType: 'OPTION_ITEM',
          sourceStableId: choice.stableId,
          title:
            optionConfig?.displayName ||
            this.composeUberDisplayName(choice.nameEn, choice.nameZh),
          description: optionConfig?.displayDescription || null,
          basePriceCents: choice.priceDeltaCents,
          priceCents: optionPriceCents,
          isAvailable: optionAvailable,
          modifierGroupIds: childGroupIds,
          hasDelta:
            optionPriceCents !== choice.priceDeltaCents ||
            optionAvailable !== choice.isAvailable,
          imageUrl: null,
        });
      }

      groupDraftMap.set(template.stableId, {
        id: groupId,
        sourceStableId: template.stableId,
        title:
          groupConfig?.displayName ||
          this.composeUberDisplayName(template.nameEn, template.nameZh),
        minSelect,
        maxSelect,
        isAvailable: template.isAvailable,
        optionItemIds,
      });
    }

    for (const menuItem of menuItems) {
      if (filters.excludedMenuItemStableIds.has(menuItem.stableId)) {
        continue;
      }
      const itemConfig = itemConfigMap.get(menuItem.stableId);
      const category = categoryById.get(menuItem.categoryId);
      if (!category) continue;

      const categoryConfig = categoryConfigMap.get(category.stableId);
      const categoryActive = categoryConfig?.isActive ?? category.isActive;
      if (!categoryActive) {
        continue;
      }

      const mappedGroupIds = menuItem.optionGroups
        .map((link) => {
          const templateStableId = link.templateGroup.stableId;
          if (!groupDraftMap.has(templateStableId)) return null;
          return this.buildStableUberNodeId('group', storeId, templateStableId);
        })
        .filter((groupId): groupId is string => Boolean(groupId));

      const priceCents = itemConfig?.priceCents ?? menuItem.basePriceCents;
      const isAvailable =
        itemConfig?.isAvailable !== undefined
          ? itemConfig.isAvailable
          : menuItem.isAvailable;

      itemDrafts.push({
        id: this.buildStableUberNodeId('item', storeId, menuItem.stableId),
        sourceType: 'MENU_ITEM',
        sourceStableId: menuItem.stableId,
        title:
          itemConfig?.displayName ||
          this.composeUberDisplayName(menuItem.nameEn, menuItem.nameZh),
        // Website ingredients are reusable English description copy, not a
        // legally complete allergen declaration. Never emit ingredientsZh.
        description:
          itemConfig?.displayDescription?.trim() ||
          menuItem.ingredientsEn?.trim() ||
          null,
        basePriceCents: menuItem.basePriceCents,
        priceCents,
        isAvailable,
        modifierGroupIds: mappedGroupIds,
        categoryStableId: category.stableId,
        sortOrder: menuItem.sortOrder,
        hasDelta:
          priceCents !== menuItem.basePriceCents ||
          isAvailable !== menuItem.isAvailable,
        imageUrl: menuItem.imageUrl,
      });
    }

    const categoryDrafts = categories
      .map((category) => {
        const categoryId = this.buildStableUberNodeId(
          'category',
          storeId,
          category.stableId,
        );
        if (filters.excludedCategoryIds.has(categoryId)) return null;
        const categoryConfig = categoryConfigMap.get(category.stableId);
        const categoryActive = categoryConfig?.isActive ?? category.isActive;
        if (!categoryActive) return null;

        const categoryItemIds = itemDrafts
          .filter((item) => item.categoryStableId === category.stableId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => item.id);
        if (!categoryItemIds.length) return null;

        return {
          id: categoryId,
          sourceStableId: category.stableId,
          title:
            categoryConfig?.displayName ||
            this.composeUberDisplayName(category.nameEn, category.nameZh),
          sortOrder: categoryConfig?.sortOrder ?? category.sortOrder,
          entities: categoryItemIds,
        };
      })
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(category),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const sourceGroups = Array.from(groupDraftMap.values()).map((group) => ({
      ...group,
      optionItemIds: [...group.optionItemIds],
    }));
    const sourceOptionItems = Array.from(optionItemDraftMap.values()).map(
      (item) => ({ ...item, modifierGroupIds: [...item.modifierGroupIds] }),
    );
    const flattened = this.flattenNestedModifiersForUber({
      storeId,
      groups: sourceGroups,
      optionItems: sourceOptionItems,
    });

    return {
      menuId: this.buildStableUberNodeId('menu', storeId, uberStoreId),
      categories: categoryDrafts,
      items: [...itemDrafts, ...flattened.optionItems],
      groups: flattened.groups,
      sourceItems: [...itemDrafts, ...sourceOptionItems],
      sourceGroups,
      optionMappings: flattened.optionMappings,
      mappingErrors: flattened.mappingErrors,
    };
  }

  /**
   * Uber Eats modifier options cannot own modifier groups. Convert the internal
   * nested graph into Uber's flat graph without mutating the source graph.
   */
  private flattenNestedModifiersForUber(input: {
    storeId: string;
    groups: Array<{
      id: string;
      sourceStableId: string;
      title: string;
      minSelect: number;
      maxSelect: number;
      isAvailable: boolean;
      optionItemIds: string[];
    }>;
    optionItems: Array<{
      id: string;
      sourceType: 'OPTION_ITEM';
      sourceStableId: string;
      title: string;
      description: string | null;
      basePriceCents: number;
      priceCents: number;
      isAvailable: boolean;
      modifierGroupIds: string[];
      hasDelta: boolean;
      imageUrl: string | null;
    }>;
  }) {
    const groupById = new Map(input.groups.map((group) => [group.id, group]));
    const optionById = new Map(
      input.optionItems.map((option) => [option.id, option]),
    );
    const outputOptions = new Map(
      input.optionItems
        .filter((option) => option.modifierGroupIds.length === 0)
        .map((option) => [option.id, { ...option, modifierGroupIds: [] }]),
    );
    const optionMappings: Array<{
      sourceOptionChoiceStableId: string;
      compositeOptionItemId: string;
      sourcePath: string[];
    }> = [];
    const mappingErrors: Array<{
      code: string;
      sourceOptionChoiceStableId: string;
      message: string;
    }> = [];

    const groups = input.groups.map((group) => {
      const optionItemIds: string[] = [];
      for (const optionId of group.optionItemIds) {
        const parent = optionById.get(optionId);
        if (!parent) continue;
        if (parent.modifierGroupIds.length === 0) {
          optionItemIds.push(parent.id);
          continue;
        }

        const childGroups = parent.modifierGroupIds
          .map((groupId) => groupById.get(groupId))
          .filter((child): child is NonNullable<typeof child> =>
            Boolean(child),
          );
        const invalidReason = this.getUberFlatteningInvalidReason(
          parent.sourceStableId,
          childGroups,
          optionById,
        );
        if (invalidReason) {
          mappingErrors.push(invalidReason);
          continue;
        }

        const selectionsByGroup = childGroups.map((childGroup) =>
          this.buildRequiredChildSelections(childGroup, optionById),
        );
        const combinations = selectionsByGroup.reduce<string[][]>(
          (acc, selections) =>
            acc.flatMap((prefix) =>
              selections.map((selection) => [...prefix, ...selection]),
            ),
          [[]],
        );
        if (
          combinations.length > UberEatsService.UBER_MODIFIER_COMBINATION_LIMIT
        ) {
          mappingErrors.push({
            code: 'UBER_MODIFIER_COMBINATION_LIMIT_EXCEEDED',
            sourceOptionChoiceStableId: parent.sourceStableId,
            message: `选项 ${parent.title} 展开后产生 ${combinations.length} 个组合，超过上限 ${UberEatsService.UBER_MODIFIER_COMBINATION_LIMIT}。`,
          });
          continue;
        }

        for (const selection of combinations) {
          const children = selection
            .map((id) => optionById.get(id))
            .filter((child): child is NonNullable<typeof child> =>
              Boolean(child),
            );
          const sourcePath = [
            parent.sourceStableId,
            ...children.map((child) => child.sourceStableId),
          ];
          const compositeId = this.buildStableUberNodeId(
            'item',
            input.storeId,
            `composite:${sourcePath.join('>')}`,
          );
          outputOptions.set(compositeId, {
            ...parent,
            id: compositeId,
            sourceStableId: parent.sourceStableId,
            title: [parent.title, ...children.map((child) => child.title)].join(
              ' / ',
            ),
            basePriceCents:
              parent.basePriceCents +
              children.reduce((sum, child) => sum + child.basePriceCents, 0),
            priceCents:
              parent.priceCents +
              children.reduce((sum, child) => sum + child.priceCents, 0),
            isAvailable:
              parent.isAvailable &&
              children.every((child) => child.isAvailable),
            modifierGroupIds: [],
            hasDelta:
              parent.hasDelta || children.some((child) => child.hasDelta),
          });
          optionItemIds.push(compositeId);
          optionMappings.push({
            sourceOptionChoiceStableId: parent.sourceStableId,
            compositeOptionItemId: compositeId,
            sourcePath,
          });
        }
      }
      return { ...group, optionItemIds };
    });

    return {
      groups,
      optionItems: Array.from(outputOptions.values()),
      optionMappings,
      mappingErrors,
    };
  }

  private getUberFlatteningInvalidReason(
    sourceOptionChoiceStableId: string,
    childGroups: Array<{
      title: string;
      minSelect: number;
      maxSelect: number;
      optionItemIds: string[];
    }>,
    optionById: Map<string, { modifierGroupIds: string[] }>,
  ) {
    const fail = (code: string, message: string) => ({
      code,
      sourceOptionChoiceStableId,
      message,
    });
    if (childGroups.length === 0) {
      return fail('UBER_CHILD_GROUP_MISSING', '子选项组不存在或已被排除。');
    }
    if (childGroups.some((group) => group.minSelect === 0)) {
      return fail(
        'UBER_OPTIONAL_CHILD_GROUP_UNSUPPORTED',
        '可选子组无法无损展开为 Uber 平面选项。',
      );
    }
    if (
      childGroups.some((group) =>
        group.optionItemIds.some(
          (optionId) =>
            (optionById.get(optionId)?.modifierGroupIds.length ?? 0) > 0,
        ),
      )
    ) {
      return fail(
        'UBER_MULTI_LEVEL_NESTING_UNSUPPORTED',
        '多级嵌套选项无法无损展开为 Uber 平面选项。',
      );
    }
    if (childGroups.filter((group) => group.maxSelect > 1).length > 1) {
      return fail(
        'UBER_MULTIPLE_MULTI_SELECT_CHILD_GROUPS_UNSUPPORTED',
        '多个可多选子组会导致不可控的笛卡尔积。',
      );
    }
    return null;
  }

  private buildRequiredChildSelections(
    group: { minSelect: number; maxSelect: number; optionItemIds: string[] },
    optionById: Map<string, { isAvailable: boolean }>,
  ) {
    const available = group.optionItemIds.filter(
      (id) => optionById.get(id)?.isAvailable !== false,
    );
    const maximum = Math.min(group.maxSelect, available.length);
    const selections: string[][] = [];
    const choose = (size: number, start = 0, selected: string[] = []) => {
      if (selected.length === size) {
        selections.push([...selected]);
        return;
      }
      for (let index = start; index < available.length; index += 1) {
        selected.push(available[index]);
        choose(size, index + 1, selected);
        selected.pop();
      }
    };
    for (let size = group.minSelect; size <= maximum; size += 1) choose(size);
    return selections;
  }

  /**
   * Turn the generated menu into a closed, reachable Uber graph. Validation is
   * deliberately performed here (rather than while reading Prisma rows) so
   * exclusions, channel availability and nested-option flattening have already
   * taken effect.
   */
  normalizeAndValidateUberMenuGraph<
    T extends {
      categories: Array<{ id: string; entities: string[] }>;
      items: Array<{
        id: string;
        sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
        sourceStableId: string;
        isAvailable: boolean;
        modifierGroupIds: string[];
      }>;
      groups: Array<{
        id: string;
        sourceStableId: string;
        minSelect: number;
        maxSelect: number;
        optionItemIds: string[];
      }>;
      mappingErrors: Array<{ code: string; message: string }>;
    },
  >(graph: T) {
    const warnings: UberMenuGraphValidationIssue[] = [];
    const errors: UberMenuGraphValidationIssue[] = graph.mappingErrors.map(
      (error) => ({ code: error.code, message: error.message }),
    );
    const itemById = new Map(graph.items.map((item) => [item.id, item]));
    const groupById = new Map(graph.groups.map((group) => [group.id, group]));
    const menuItemIds = new Set<string>();

    const categories = graph.categories.map((category) => {
      const entities = category.entities.filter((itemId) => {
        const item = itemById.get(itemId);
        if (!item || item.sourceType !== 'MENU_ITEM') {
          errors.push({
            code: 'UBER_CATEGORY_ITEM_MISSING',
            message: `Category ${category.id} references missing menu item ${itemId}.`,
            itemId,
          });
          return false;
        }
        menuItemIds.add(itemId);
        return true;
      });
      return { ...category, entities };
    });

    const reachableGroupIds = new Set<string>();
    const candidateItems = new Map<string, (typeof graph.items)[number]>();
    for (const itemId of menuItemIds) {
      const item = itemById.get(itemId);
      if (item) candidateItems.set(itemId, item);
    }

    // Start at published dishes. Flattened Uber options may not reference more
    // groups, but the queue keeps this correct if that restriction changes.
    const groupQueue = Array.from(candidateItems.values()).flatMap(
      (item) => item.modifierGroupIds,
    );
    for (let index = 0; index < groupQueue.length; index += 1) {
      const groupId = groupQueue[index];
      if (reachableGroupIds.has(groupId)) continue;
      const group = groupById.get(groupId);
      if (!group) continue;
      reachableGroupIds.add(groupId);
      for (const optionId of group.optionItemIds) {
        const option = itemById.get(optionId);
        if (!option || option.sourceType !== 'OPTION_ITEM') continue;
        candidateItems.set(optionId, option);
        groupQueue.push(...option.modifierGroupIds);
      }
    }

    const groups = graph.groups
      .filter((group) => reachableGroupIds.has(group.id))
      .map((group) => {
        const optionItemIds = group.optionItemIds.filter((optionItemId) => {
          const option = itemById.get(optionItemId);
          if (!option || option.sourceType !== 'OPTION_ITEM') {
            errors.push({
              code: 'UBER_GROUP_OPTION_MISSING',
              message: `Modifier group ${group.id} references missing option item ${optionItemId}.`,
              groupId: group.id,
              groupStableId: group.sourceStableId,
              optionItemId,
            });
            return false;
          }
          if (!option.isAvailable) {
            warnings.push({
              code: 'UBER_UNAVAILABLE_OPTION_REMOVED',
              message: `Unavailable option item ${optionItemId} was removed from modifier group ${group.id}.`,
              groupId: group.id,
              groupStableId: group.sourceStableId,
              optionItemId,
            });
            candidateItems.delete(optionItemId);
            return false;
          }
          return true;
        });
        return { ...group, optionItemIds };
      });

    const nonEmptyGroupIds = new Set(
      groups.filter((group) => group.optionItemIds.length > 0).map((g) => g.id),
    );
    const normalizedItems = Array.from(candidateItems.values()).map((item) => {
      const modifierGroupIds = item.modifierGroupIds.filter((groupId) => {
        const group = groupById.get(groupId);
        if (!group) {
          errors.push({
            code: 'UBER_ITEM_GROUP_MISSING',
            message: `Item ${item.id} references missing modifier group ${groupId}.`,
            itemId: item.id,
            itemStableId: item.sourceStableId,
            groupId,
          });
          return false;
        }
        if (nonEmptyGroupIds.has(groupId)) return true;
        const issue = {
          code:
            group.minSelect > 0
              ? 'UBER_REQUIRED_GROUP_EMPTY'
              : 'UBER_EMPTY_GROUP_REMOVED',
          message: `Item ${item.id} (${item.sourceStableId}) references empty modifier group ${group.id} (${group.sourceStableId}).`,
          itemId: item.id,
          itemStableId: item.sourceStableId,
          groupId: group.id,
          groupStableId: group.sourceStableId,
        };
        (group.minSelect > 0 ? errors : warnings).push(issue);
        return false;
      });
      return { ...item, modifierGroupIds };
    });

    const retainedGroups = groups.filter((group) =>
      nonEmptyGroupIds.has(group.id),
    );
    for (const group of retainedGroups) {
      const selectableCount = group.optionItemIds.length;
      if (
        !Number.isInteger(group.minSelect) ||
        !Number.isInteger(group.maxSelect) ||
        group.minSelect < 0 ||
        group.minSelect > group.maxSelect ||
        group.maxSelect > selectableCount
      ) {
        errors.push({
          code: 'UBER_GROUP_QUANTITY_INVALID',
          message: `Modifier group ${group.id} (${group.sourceStableId}) has minSelect=${group.minSelect}, maxSelect=${group.maxSelect}, but only ${selectableCount} selectable options; Uber options cannot be selected repeatedly.`,
          groupId: group.id,
          groupStableId: group.sourceStableId,
        });
      }
    }

    const retainedOptionIds = new Set(
      retainedGroups.flatMap((group) => group.optionItemIds),
    );
    const items = normalizedItems.filter(
      (item) =>
        item.sourceType === 'MENU_ITEM' || retainedOptionIds.has(item.id),
    );

    return {
      graph: { ...graph, categories, items, groups: retainedGroups },
      warnings,
      errors,
    };
  }

  /** Validate the final wire payload. Both preview and upload must pass here. */
  validateUberMenuPayload(
    payload: UberMenuUploadPayload,
  ): UberMenuPayloadValidationIssue[] {
    const issues: UberMenuPayloadValidationIssue[] = [];
    const error = (
      code: string,
      path: string,
      sourceStableId: string | null,
      message: string,
    ) =>
      issues.push({ code, severity: 'ERROR', path, sourceStableId, message });
    const warning = (
      code: string,
      path: string,
      sourceStableId: string | null,
      message: string,
    ) =>
      issues.push({ code, severity: 'WARNING', path, sourceStableId, message });
    const collections: Array<
      readonly [
        string,
        Array<{
          id: string;
          title: { translations: { en_us: string } };
        }>,
      ]
    > = [
      ['menus', payload.menus],
      ['categories', payload.categories],
      ['items', payload.items],
      ['modifier_groups', payload.modifier_groups],
    ] as const;
    const ids = new Map<string, string>();
    for (const [name, nodes] of collections) {
      nodes.forEach((node, index) => {
        const path = `$.${name}[${index}]`;
        if (!node.id || ids.has(node.id)) {
          error(
            'UBER_ID_NOT_GLOBALLY_UNIQUE',
            `${path}.id`,
            node.id || null,
            node.id ? `ID“${node.id}”在顶层实体中重复。` : '实体 ID 不能为空。',
          );
        } else ids.set(node.id, path);
        const title = node.title?.translations?.en_us;
        if (typeof title !== 'string' || !title.trim() || title.length > 300)
          error(
            'UBER_TITLE_INVALID',
            `${path}.title.translations.en_us`,
            node.id || null,
            '标题不能为空且长度不得超过 300 个字符。',
          );
      });
    }
    const categoryIds = new Set(payload.categories.map((x) => x.id));
    const itemIds = new Set(payload.items.map((x) => x.id));
    const groupIds = new Set(payload.modifier_groups.map((x) => x.id));
    payload.menus.forEach((menu, mi) => {
      if (!menu.category_ids.length)
        error(
          'UBER_MENU_CATEGORY_EMPTY',
          `$.menus[${mi}].category_ids`,
          menu.id,
          '菜单至少需要一个分类。',
        );
      menu.category_ids.forEach((id, i) => {
        if (!categoryIds.has(id))
          error(
            'UBER_REFERENCE_UNRESOLVED',
            `$.menus[${mi}].category_ids[${i}]`,
            menu.id,
            `引用的分类“${id}”不存在。`,
          );
      });
    });
    payload.categories.forEach((category, ci) => {
      if (!category.entities.length)
        error(
          'UBER_CATEGORY_ITEM_EMPTY',
          `$.categories[${ci}].entities`,
          category.id,
          '分类至少需要一个菜品。',
        );
      category.entities.forEach((ref, ri) => {
        const path = `$.categories[${ci}].entities[${ri}]`;
        if (ref.type !== 'ITEM')
          error(
            'UBER_CATEGORY_ENTITY_TYPE_INVALID',
            `${path}.type`,
            category.id,
            '分类实体类型必须为 ITEM。',
          );
        if (!itemIds.has(ref.id))
          error(
            'UBER_REFERENCE_UNRESOLVED',
            `${path}.id`,
            category.id,
            `引用的菜品“${ref.id}”不存在。`,
          );
      });
    });
    payload.items.forEach((item, ii) => {
      const descriptionPath = `$.items[${ii}].description.translations.en_us`;
      const descriptionNode = item.description;
      if (descriptionNode !== undefined) {
        const description = descriptionNode.translations?.en_us;
        if (typeof description !== 'string') {
          error(
            'UBER_DESCRIPTION_INVALID',
            descriptionPath,
            item.id,
            '描述必须是字符串。',
          );
        } else {
          const cleanedDescription = description.replace(/\s+/g, ' ').trim();
          if (!cleanedDescription) {
            delete item.description;
            warning(
              'UBER_DESCRIPTION_EMPTY_REMOVED',
              descriptionPath,
              item.id,
              '空白描述已从发布 payload 中移除。',
            );
          } else if (
            cleanedDescription.length > UBER_ITEM_DESCRIPTION_MAX_LENGTH
          ) {
            descriptionNode.translations.en_us = cleanedDescription.slice(
              0,
              UBER_ITEM_DESCRIPTION_MAX_LENGTH,
            );
            warning(
              'UBER_DESCRIPTION_TRUNCATED',
              descriptionPath,
              item.id,
              `描述超过 Uber schema 的 ${UBER_ITEM_DESCRIPTION_MAX_LENGTH} 个字符限制，已清理并截断。`,
            );
          } else {
            descriptionNode.translations.en_us = cleanedDescription;
          }
        }
      }
      if (item.image_url !== undefined) {
        const imagePath = `$.items[${ii}].image_url`;
        if (!isPermanentPublicHttpsUrl(item.image_url))
          error(
            'UBER_IMAGE_URL_INVALID',
            imagePath,
            item.id,
            `图片地址必须是不超过 ${UBER_IMAGE_URL_MAX_LENGTH} 个字符、不含临时签名的永久公网 HTTPS URL。`,
          );
      }
      if (
        !Number.isInteger(item.price_info?.price) ||
        item.price_info.price < 0
      )
        error(
          'UBER_PRICE_INVALID',
          `$.items[${ii}].price_info.price`,
          item.id,
          '价格必须为非负整数（分）。',
        );
      if (
        !Number.isFinite(item.tax_info?.tax_rate) ||
        item.tax_info.tax_rate < 0 ||
        item.tax_info.tax_rate > 100
      )
        error(
          'UBER_TAX_RATE_INVALID',
          `$.items[${ii}].tax_info.tax_rate`,
          item.id,
          '税率必须使用 0～100 的百分数格式。',
        );
      (item.modifier_group_ids.ids ?? []).forEach((id, gi) => {
        if (!groupIds.has(id))
          error(
            'UBER_REFERENCE_UNRESOLVED',
            `$.items[${ii}].modifier_group_ids[${gi}]`,
            item.id,
            `引用的选项组“${id}”不存在。`,
          );
      });
    });
    const optionIds = new Set(
      payload.modifier_groups.flatMap((g) =>
        g.modifier_options.map((o) => o.id),
      ),
    );
    payload.modifier_groups.forEach((group, gi) => {
      const min = group.quantity_info?.quantity?.min_permitted;
      const max = group.quantity_info?.quantity?.max_permitted;
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < 0 ||
        min > max ||
        max > group.modifier_options.length
      )
        error(
          'UBER_GROUP_QUANTITY_INVALID',
          `$.modifier_groups[${gi}].quantity_info.quantity`,
          group.id,
          '组选取数量必须为整数，且满足 0 ≤ min ≤ max ≤ 可选项数量。',
        );
      if (min > 0 && group.modifier_options.length === 0)
        error(
          'UBER_REQUIRED_GROUP_EMPTY',
          `$.modifier_groups[${gi}].modifier_options`,
          group.id,
          '必选组选项不能为空。',
        );
      group.modifier_options.forEach((ref, oi) => {
        const path = `$.modifier_groups[${gi}].modifier_options[${oi}]`;
        if (ref.type !== 'ITEM')
          error(
            'UBER_MODIFIER_OPTION_TYPE_INVALID',
            `${path}.type`,
            group.id,
            'Modifier option 类型必须为 ITEM。',
          );
        if (!itemIds.has(ref.id))
          error(
            'UBER_REFERENCE_UNRESOLVED',
            `${path}.id`,
            group.id,
            `引用的选项菜品“${ref.id}”不存在。`,
          );
      });
    });
    payload.items.forEach((item, ii) => {
      if (optionIds.has(item.id) && (item.modifier_group_ids.ids?.length ?? 0))
        error(
          'UBER_OPTION_ITEM_HAS_MODIFIER_GROUP',
          `$.items[${ii}].modifier_group_ids.ids`,
          item.id,
          'Option item 不得再引用 modifier group。',
        );
    });
    const availability = payload.menus.flatMap(
      (menu) => menu.service_availability ?? [],
    );
    if (
      availability.length === 0 ||
      availability.every((day) => day.time_periods.length === 0)
    )
      error(
        'UBER_SERVICE_AVAILABILITY_EMPTY',
        '$.menus[0].service_availability',
        null,
        '发布前必须至少配置一个合法可售营业时段。',
      );
    availability?.forEach((day, di) =>
      day.time_periods?.forEach((period, pi) => {
        const time = /^([01]\d|2[0-3]):[0-5]\d$/;
        const validEnd =
          time.test(period.end_time ?? '') || period.end_time === '24:00';
        if (
          !day.day_of_week ||
          !time.test(period.start_time ?? '') ||
          !validEnd ||
          period.start_time >= period.end_time
        )
          error(
            'UBER_SERVICE_AVAILABILITY_INVALID',
            `$.menus[0].service_availability[${di}].time_periods[${pi}]`,
            null,
            '营业时段必须包含星期，并使用有效且起始早于结束的 HH:mm 时间（当日终点可为 24:00）。',
          );
      }),
    );
    return issues;
  }

  private async validateUberMenuImages(payload: UberMenuUploadPayload) {
    const issues: UberMenuPayloadValidationIssue[] = [];
    const results: Array<{
      itemId: string;
      requestedUrl: string;
      finalUrl: string | null;
      finalOrigin: string | null;
      redirected: boolean;
      contentType: string | null;
      sizeBytes: number | null;
      method: 'HEAD' | 'GET';
      ok: boolean;
    }> = [];
    for (const [index, item] of payload.items.entries()) {
      if (!item.image_url) continue;
      const path = `$.items[${index}].image_url`;
      const requestedUrl = item.image_url;
      let method: 'HEAD' | 'GET' = 'HEAD';
      try {
        let response = await fetch(requestedUrl, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(5_000),
        });
        if (response.status === 405 || response.status === 501) {
          method = 'GET';
          response = await fetch(requestedUrl, {
            method: 'GET',
            headers: { Range: `bytes=0-${UBER_IMAGE_MAX_BYTES}` },
            redirect: 'follow',
            signal: AbortSignal.timeout(8_000),
          });
        }
        const finalUrl = response.url || requestedUrl;
        const finalOrigin = new URL(finalUrl).origin;
        const redirected = finalUrl !== requestedUrl;
        const contentType =
          response.headers.get('content-type')?.split(';')[0] ?? null;
        const declaredSize = Number(response.headers.get('content-length'));
        let sizeBytes =
          Number.isFinite(declaredSize) && declaredSize >= 0
            ? declaredSize
            : null;
        if (method === 'GET' && sizeBytes === null && response.body) {
          const reader = response.body.getReader();
          let received = 0;
          while (received <= UBER_IMAGE_MAX_BYTES) {
            const chunk = await reader.read();
            if (chunk.done) break;
            received += chunk.value.byteLength;
          }
          await reader.cancel();
          sizeBytes = received;
        }
        const errors: string[] = [];
        if (!response.ok) errors.push(`HTTP ${response.status}`);
        if (!isPermanentPublicHttpsUrl(finalUrl))
          errors.push('重定向后的地址不是永久公网 HTTPS URL');
        if (!contentType?.toLowerCase().startsWith('image/'))
          errors.push(`Content-Type 不是 image/*（${contentType ?? '缺失'}）`);
        if (sizeBytes === null)
          errors.push('无法通过 HEAD 或受限 GET 确认文件大小');
        else if (sizeBytes > UBER_IMAGE_MAX_BYTES)
          errors.push(`文件超过 ${UBER_IMAGE_MAX_BYTES} bytes`);
        if (errors.length) {
          issues.push({
            code: 'UBER_IMAGE_PREFLIGHT_FAILED',
            severity: 'ERROR',
            path,
            sourceStableId: item.id,
            message: `图片发布前校验失败：${errors.join('；')}。`,
          });
        }
        results.push({
          itemId: item.id,
          requestedUrl,
          finalUrl,
          finalOrigin,
          redirected,
          contentType,
          sizeBytes,
          method,
          ok: errors.length === 0,
        });
      } catch (error) {
        issues.push({
          code: 'UBER_IMAGE_NOT_PUBLIC',
          severity: 'ERROR',
          path,
          sourceStableId: item.id,
          message: `图片无法公开访问：${error instanceof Error ? error.message : String(error)}`,
        });
        results.push({
          itemId: item.id,
          requestedUrl,
          finalUrl: null,
          finalOrigin: null,
          redirected: false,
          contentType: null,
          sizeBytes: null,
          method,
          ok: false,
        });
      }
    }
    return { issues, results };
  }

  private buildModifierFlatteningReport(
    graph: {
      items: Array<{ id: string; priceCents: number }>;
      groups: Array<{
        id: string;
        minSelect: number;
        maxSelect: number;
        optionItemIds: string[];
      }>;
    },
    mappings: Array<{
      sourceOptionChoiceStableId: string;
      compositeOptionItemId: string;
      sourcePath: string[];
    }>,
  ) {
    const priceById = new Map(
      graph.items.map((item) => [item.id, item.priceCents]),
    );
    return {
      reference:
        'Uber example menu payload: modifier_options reference ITEM ids',
      optionIdSemantics: 'modifier_options[].id === items[].id',
      groups: graph.groups.map((group) => ({
        groupId: group.id,
        minPermitted: group.minSelect,
        maxPermitted: group.maxSelect,
        optionCount: group.optionItemIds.length,
        valid:
          group.minSelect >= 0 &&
          group.minSelect <= group.maxSelect &&
          group.maxSelect <= group.optionItemIds.length &&
          group.optionItemIds.every((id) => priceById.has(id)),
      })),
      combinations: mappings.map((mapping) => ({
        ...mapping,
        combinedPriceCents:
          priceById.get(mapping.compositeOptionItemId) ?? null,
      })),
    };
  }

  private buildUberUploadMenuPayload(
    graph: {
      menuId: string;
      categories: Array<{
        id: string;
        title: string;
        entities: string[];
      }>;
      items: Array<{
        id: string;
        sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
        sourceStableId: string;
        title: string;
        description: string | null;
        priceCents: number;
        isAvailable: boolean;
        modifierGroupIds: string[];
        imageUrl: string | null;
      }>;
      groups: Array<{
        id: string;
        title: string;
        minSelect: number;
        maxSelect: number;
        optionItemIds: string[];
      }>;
    },
    serviceAvailability: UberServiceAvailability[],
    taxRatePercentage: number,
  ): UberMenuUploadPayload {
    return {
      menus: [
        {
          id: graph.menuId,
          title: {
            translations: {
              en_us: 'Main Menu',
            },
          },
          category_ids: graph.categories.map((category) => category.id),
          service_availability: serviceAvailability,
        },
      ],
      categories: graph.categories.map((category) => ({
        id: category.id,
        title: { translations: { en_us: category.title } },
        entities: category.entities.map((id) => ({ id, type: 'ITEM' })),
      })),
      items: graph.items.map((item) => ({
        id: item.id,
        title: {
          translations: {
            en_us: item.title || item.sourceStableId,
          },
        },
        ...(item.description
          ? {
              description: {
                translations: {
                  en_us: item.description,
                },
              },
            }
          : {}),
        price_info: { price: item.priceCents, overrides: [] },
        tax_info: {
          tax_rate: taxRatePercentage,
          vat_rate_percentage: null,
        },
        modifier_group_ids: {
          ids:
            item.sourceType === 'OPTION_ITEM' || !item.modifierGroupIds.length
              ? null
              : item.modifierGroupIds,
          overrides: [],
        },
        suspension_info: item.isAvailable
          ? null
          : {
              suspension: {
                suspend_until: Date.UTC(2099, 0, 1),
                reason: 'Item unavailable',
              },
            },
        ...(item.sourceType === 'MENU_ITEM' &&
        resolveUberImageUrl(item.imageUrl)
          ? { image_url: resolveUberImageUrl(item.imageUrl) as string }
          : {}),
      })),
      modifier_groups: graph.groups.map((group) => ({
        id: group.id,
        title: {
          translations: {
            en_us: group.title,
          },
        },
        quantity_info: {
          quantity: {
            min_permitted: group.minSelect,
            max_permitted: group.maxSelect,
          },
        },
        modifier_options: group.optionItemIds.map((optionItemId) => ({
          type: 'ITEM',
          id: optionItemId,
        })),
      })),
    };
  }

  private async getUberMenuSchedule(): Promise<{
    timezone: string;
    serviceAvailability: UberServiceAvailability[];
    taxRatePercentage: number;
    taxRateSource: string;
  }> {
    const [config, hours] = await Promise.all([
      this.prisma.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true, salesTaxRate: true },
      }),
      this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
    ]);
    const timezone = config?.timezone?.trim();
    if (!timezone) {
      throw new BadRequestException('发布 Uber 菜单前必须配置门店时区。');
    }
    if (/^(?:UTC|GMT)?[+-]\d{1,2}(?::?\d{2})?$/i.test(timezone)) {
      throw new BadRequestException(
        '夏令时地区不得使用固定 UTC offset，请配置 IANA timezone（例如 America/Toronto）。',
      );
    }
    const salesTaxRate = config?.salesTaxRate;
    if (
      typeof salesTaxRate !== 'number' ||
      !Number.isFinite(salesTaxRate) ||
      salesTaxRate < 0 ||
      salesTaxRate > 1
    ) {
      throw new BadRequestException(
        'salesTaxRate 必须使用 0～1 的比例格式，例如 13% 应保存为 0.13',
      );
    }
    const taxRatePercentage = Number((salesTaxRate * 100).toFixed(4));
    const serviceAvailability = toUberServiceAvailability(hours, timezone);
    if (serviceAvailability.length === 0) {
      throw new BadRequestException(
        '发布 Uber 菜单前必须至少配置一个合法可售营业时段；全天营业请明确配置 00:00–24:00。',
      );
    }
    return {
      timezone,
      serviceAvailability,
      taxRatePercentage,
      taxRateSource: 'BusinessConfig.salesTaxRate',
    };
  }

  private async assertUberStoreTimezone(
    uberStoreId: string,
    businessTimezone: string,
    timezoneConfirmed: boolean,
  ): Promise<void> {
    const mapping = await this.prisma.uberStoreMapping.findFirst({
      where: { uberStoreId },
      select: { rawPayload: true },
    });
    const uberTimezone = this.readUberStoreTimezone(mapping?.rawPayload);
    if (uberTimezone && uberTimezone !== businessTimezone) {
      throw new BadRequestException(
        `BusinessConfig.timezone（${businessTimezone}）与 Uber 门店时区（${uberTimezone}）不一致，已阻止正式发布。`,
      );
    }
    if (!uberTimezone && !timezoneConfirmed) {
      throw new BadRequestException(
        `Uber API 未返回门店时区；请在管理页确认 Uber 门店使用 ${businessTimezone} 后再正式发布。`,
      );
    }
  }

  private readUberStoreTimezone(payload: unknown): string | null {
    const store = this.asObject(payload);
    const location = this.asObject(store?.location);
    return this.readString(
      store?.timezone,
      store?.time_zone,
      location?.timezone,
      location?.time_zone,
    );
  }

  private buildUberDraftEdges(graph: {
    categories: Array<{ id: string; entities: string[] }>;
    items: Array<{ id: string; modifierGroupIds: string[] }>;
    groups: Array<{ id: string; optionItemIds: string[] }>;
  }) {
    const edges: Array<{ from: string; to: string; type: string }> = [];
    for (const category of graph.categories) {
      for (const itemId of category.entities) {
        edges.push({ from: category.id, to: itemId, type: 'CATEGORY_ITEM' });
      }
    }
    for (const item of graph.items) {
      for (const groupId of item.modifierGroupIds) {
        edges.push({ from: item.id, to: groupId, type: 'ITEM_GROUP' });
      }
    }
    for (const group of graph.groups) {
      for (const optionItemId of group.optionItemIds) {
        edges.push({ from: group.id, to: optionItemId, type: 'GROUP_OPTION' });
      }
    }
    return edges;
  }

  private buildUberDraftTreeNodes(
    categories: Array<{
      id: string;
      name: string;
      items: Array<{
        id: string;
        sourceMenuItemStableId: string;
        displayName: string;
        priceCents: number;
        isAvailable: boolean;
        groups: Array<{
          id: string;
          name: string;
          minSelect: number;
          maxSelect: number;
          options: Array<{
            id: string;
            sourceOptionChoiceStableId: string;
            displayName: string;
            priceDeltaCents: number;
            isAvailable: boolean;
            childGroups: Array<{
              id: string;
              name: string;
              minSelect: number;
              maxSelect: number;
            }>;
          }>;
        }>;
      }>;
    }>,
  ) {
    return categories.map((category) => ({
      id: category.id,
      type: 'category',
      name: category.name,
      sourceStableId: category.id,
      source: 'AUTO-MAPPED',
      children: category.items.map((item) => ({
        id: item.id,
        type: 'item',
        name: item.displayName,
        sourceStableId: item.sourceMenuItemStableId,
        source: 'AUTO-MAPPED',
        priceCents: item.priceCents,
        isAvailable: item.isAvailable,
        children: item.groups.map((group) => ({
          id: group.id,
          type: 'group',
          name: group.name,
          sourceStableId: group.id,
          source: 'AUTO-MAPPED',
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          children: group.options.map((option) => ({
            id: option.id,
            type: 'option',
            name: option.displayName,
            sourceStableId: option.sourceOptionChoiceStableId,
            source: 'AUTO-MAPPED',
            priceDeltaCents: option.priceDeltaCents,
            isAvailable: option.isAvailable,
            childGroupIds: option.childGroups.map(
              (childGroup) => childGroup.id,
            ),
            children: option.childGroups.map((childGroup) => ({
              id: childGroup.id,
              type: 'group',
              name: childGroup.name,
              sourceStableId: childGroup.id,
              source: 'AUTO-MAPPED',
              minSelect: childGroup.minSelect,
              maxSelect: childGroup.maxSelect,
            })),
          })),
        })),
      })),
    }));
  }

  private extractPublishedSnapshotFromPayload(payload: unknown) {
    const itemIds = new Set<string>();
    const groupIds = new Set<string>();
    const edgeKeys = new Set<string>();
    const root = this.asObject(payload);
    if (!root) {
      return { itemIds, groupIds, edgeKeys };
    }

    const categories = Array.isArray(root.categories) ? root.categories : [];
    const items = Array.isArray(root.items) ? root.items : [];
    const modifierGroups = Array.isArray(root.modifier_groups)
      ? root.modifier_groups
      : [];

    for (const rawCategory of categories) {
      const category = this.asObject(rawCategory);
      const categoryId = this.readString(category?.id);
      const entities = Array.isArray(category?.entities)
        ? category.entities
        : [];
      if (!categoryId) continue;
      for (const entity of entities) {
        const entityRef = this.asObject(entity);
        const itemId =
          this.readString(entityRef?.id) ?? this.readString(entity);
        if (!itemId) continue;
        edgeKeys.add(`CATEGORY_ITEM:${categoryId}->${itemId}`);
      }
    }

    for (const rawItem of items) {
      const item = this.asObject(rawItem);
      const itemId = this.readString(item?.id);
      if (!itemId) continue;
      itemIds.add(itemId);
      const groupIdsInItem = Array.isArray(item?.modifier_group_ids)
        ? item.modifier_group_ids
        : [];
      for (const groupIdRaw of groupIdsInItem) {
        const groupId = this.readString(groupIdRaw);
        if (!groupId) continue;
        edgeKeys.add(`ITEM_GROUP:${itemId}->${groupId}`);
      }
    }

    for (const rawGroup of modifierGroups) {
      const group = this.asObject(rawGroup);
      const groupId = this.readString(group?.id);
      if (!groupId) continue;
      groupIds.add(groupId);
      const options = Array.isArray(group?.modifier_options)
        ? group.modifier_options
        : [];
      for (const rawOption of options) {
        const option = this.asObject(rawOption);
        const optionId = this.readString(option?.id);
        if (!optionId) continue;
        edgeKeys.add(`GROUP_OPTION:${groupId}->${optionId}`);
      }
    }

    return { itemIds, groupIds, edgeKeys };
  }

  private decodeDraftEdgeKey(edgeKey: string) {
    const [type, relation] = edgeKey.split(':');
    if (!type || !relation) return null;
    const [from, to] = relation.split('->');
    if (!from || !to) return null;
    return { type, from, to };
  }

  private summarizePublishGraph(graph: {
    items: Array<{ hasDelta: boolean }>;
    categories: unknown[];
    groups: unknown[];
  }) {
    const changedItems = graph.items.filter((item) => item.hasDelta).length;
    return {
      totalItems: graph.items.length,
      changedItems,
      totalCategories: graph.categories.length,
      totalModifierGroups: graph.groups.length,
    };
  }

  private async uploadUberMenu(
    uberStoreId: string,
    payload: UberMenuUploadPayload,
  ): Promise<Record<string, unknown>> {
    const accessToken = await this.uberAuthService.getAccessToken('eats.store');

    return this.callUberApi(
      `/v2/eats/stores/${encodeURIComponent(uberStoreId)}/menus`,
      {
        accessToken,
        method: 'PUT',
        body: payload as unknown as Record<string, unknown>,
      },
    );
  }

  /**
   * Menu uploads are asynchronous at Uber. Accounts subscribed to menu
   * notifications must wait for the webhook; other accounts verify the menu
   * through the read API instead of treating the PUT response as completion.
   */
  private hasMenuNotificationCapability(): boolean {
    return /^(1|true|yes)$/i.test(
      process.env.UBER_EATS_MENU_NOTIFICATIONS_ENABLED?.trim() ?? '',
    );
  }

  private async confirmUploadedMenu(
    versionId: string,
    uberStoreId: string,
    requested: UberMenuUploadPayload,
  ): Promise<'SUBMITTED' | 'SUCCEEDED' | 'FAILED'> {
    try {
      const accessToken =
        await this.uberAuthService.getAccessToken('eats.store');
      const response = await this.callUberApi(
        `/v2/eats/stores/${encodeURIComponent(uberStoreId)}/menus`,
        { accessToken, method: 'GET' },
      );
      const readPayload = this.asObject(response.menu ?? response) ?? {};
      const expectedIds = requested.items.map((item) => item.id);
      const actualIds = new Set(
        (Array.isArray(readPayload.items) ? readPayload.items : [])
          .map((item) => this.readString(this.asObject(item)?.id))
          .filter((id): id is string => Boolean(id)),
      );

      // A readable response can still be the previous menu while Uber is
      // processing. Only the uploaded entity set confirms this version.
      if (
        expectedIds.length === 0 ||
        expectedIds.every((itemId) => actualIds.has(itemId))
      ) {
        await this.markMenuPublishVersionSuccess(versionId, response);
        return 'SUCCEEDED';
      }
      return 'SUBMITTED';
    } catch (error) {
      // A transient read failure does not prove that asynchronous processing
      // failed. Preserve SUBMITTED so a later refresh/reconciliation can retry.
      await this.captureEvent('ubereats_menu_confirmation_pending', {
        uberStoreId,
        reason: error instanceof Error ? error.message : `${error}`,
      });
      return 'SUBMITTED';
    }
  }

  private async pollUploadedMenuUntilTerminal(
    versionId: string,
    storeId: string,
    uberStoreId: string,
    requested: UberMenuUploadPayload,
  ): Promise<void> {
    const timeoutMs = Math.max(
      1,
      Number(process.env.UBER_EATS_MENU_CONFIRM_TIMEOUT_MS ?? 120_000),
    );
    const initialDelayMs = Math.max(
      1,
      Number(process.env.UBER_EATS_MENU_CONFIRM_INITIAL_DELAY_MS ?? 1_000),
    );
    const startedAt = Date.now();
    let delayMs = initialDelayMs;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const current = await this.prisma.uberMenuPublishVersion.findUnique({
        where: { id: versionId },
        select: { status: true },
      });
      if (
        current?.status === UberMenuPublishStatus.SUCCEEDED ||
        current?.status === UberMenuPublishStatus.FAILED
      )
        return;
      const status = await this.confirmUploadedMenu(
        versionId,
        uberStoreId,
        requested,
      );
      if (status !== 'SUBMITTED') return;
      delayMs = Math.min(delayMs * 2, 30_000);
    }

    // Timeout is deliberately not success: retain SUBMITTED and make the
    // unresolved publication visible to operations without a schema change.
    await this.prisma.uberOpsTicket.create({
      data: {
        storeId,
        type: UberOpsTicketType.MENU_PUBLISH,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: `Uber 菜单发布确认超时：${versionId}`,
        description: `在 ${timeoutMs}ms 内未确认 Uber 菜单发布结果。`,
        context: { versionId, uberStoreId, state: 'TIMED_OUT' },
      },
    });
    await this.captureEvent('ubereats_menu_confirmation_timed_out', {
      versionId,
      uberStoreId,
      timeoutMs,
    });
  }

  private async createMenuPublishVersionStarted(
    storeId: string,
    uberStoreId: string,
    summary: { totalItems: number; changedItems: number },
    payload: UberMenuUploadPayload,
    graph: {
      items: Array<{
        id: string;
        sourceStableId: string;
        priceCents: number;
        isAvailable: boolean;
        title: string;
      }>;
    },
  ) {
    const checksum = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const payloadItemIds = new Set(payload.items.map((item) => item.id));
    const publishedAt = new Date();
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.uberMenuPublishVersion.create({
        data: {
          storeId,
          uberStoreId,
          status: UberMenuPublishStatus.SUBMITTED,
          totalItems: summary.totalItems,
          changedItems: summary.changedItems,
          requestPayload: payload as Prisma.InputJsonValue,
          payload: payload as Prisma.InputJsonValue,
          checksum,
        },
        select: { id: true, versionStableId: true, createdAt: true },
      });
      await (
        tx as unknown as {
          uberPublishedMenuItem: {
            createMany: (args: unknown) => Promise<unknown>;
          };
        }
      ).uberPublishedMenuItem.createMany({
        data: graph.items
          .filter((item) => payloadItemIds.has(item.id))
          .map((item) => ({
            publishVersionId: created.id,
            storeId,
            uberStoreId,
            uberItemId: item.id,
            menuItemStableId: item.sourceStableId,
            publishedPriceCents: item.priceCents,
            publishedIsAvailable: item.isAvailable,
            publishedName: item.title,
            publishedAt,
          })),
      });
      return created;
    });

    return version;
  }

  private async markMenuPublishVersionSubmitted(
    id: string,
    responsePayload: Record<string, unknown>,
  ) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id },
      data: {
        status: UberMenuPublishStatus.SUBMITTED,
        responsePayload: responsePayload as Prisma.InputJsonValue,
        errorMessage: null,
        errorDetails: undefined,
        finishedAt: null,
      },
    });
  }

  private async markMenuPublishVersionSuccess(
    id: string,
    responsePayload: Record<string, unknown>,
  ) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id },
      data: {
        status: UberMenuPublishStatus.SUCCEEDED,
        responsePayload: responsePayload as Prisma.InputJsonValue,
        errorMessage: null,
        errorDetails: undefined,
        finishedAt: new Date(),
      },
    });
  }

  private async markMenuPublishVersionFailed(
    id: string,
    errorMessage: string,
    errors: UberMenuPublishError[] = [],
  ) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id },
      data: {
        status: UberMenuPublishStatus.FAILED,
        errorMessage,
        errorDetails: errors as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  }

  private async backfillPublishedStateFromGraph(
    storeId: string,
    uberStoreId: string,
    graph: {
      items: Array<{
        sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
        sourceStableId: string;
        priceCents: number;
        isAvailable: boolean;
      }>;
    },
  ) {
    const now = new Date();
    const menuItems = graph.items.filter(
      (
        item,
      ): item is (typeof graph.items)[number] & { sourceType: 'MENU_ITEM' } =>
        item.sourceType === 'MENU_ITEM',
    );
    const optionItems = graph.items.filter(
      (
        item,
      ): item is (typeof graph.items)[number] & { sourceType: 'OPTION_ITEM' } =>
        item.sourceType === 'OPTION_ITEM',
    );

    await Promise.all(
      menuItems.map((item) =>
        this.prisma.uberItemChannelConfig.updateMany({
          where: {
            storeId,
            menuItemStableId: item.sourceStableId,
          },
          data: {
            uberStoreId,
            lastPublishedPriceCents: item.priceCents,
            lastPublishedIsAvailable: item.isAvailable,
            lastPublishedHash: this.buildStableUberNodeId(
              'publish',
              storeId,
              item.sourceStableId,
            ),
            lastPublishedAt: now,
            lastPublishError: null,
          },
        }),
      ),
    );

    await Promise.all(
      optionItems.map((item) =>
        this.prisma.uberOptionItemConfig.updateMany({
          where: {
            storeId,
            optionChoiceStableId: item.sourceStableId,
          },
          data: {
            uberStoreId,
            lastPublishedPriceDeltaCents: item.priceCents,
            lastPublishedIsAvailable: item.isAvailable,
            lastPublishedHash: this.buildStableUberNodeId(
              'publish',
              storeId,
              item.sourceStableId,
            ),
            lastPublishedAt: now,
            lastPublishError: null,
          },
        }),
      ),
    );
  }

  private async upsertUberOrder(
    order: ParsedUberOrder,
    eventType: string,
    eventId: string,
  ) {
    const clientRequestId = this.toClientRequestId(order.externalOrderId);
    const mappedStatus = this.mapEventTypeToOrderStatus(eventType);
    const amountValidation = this.validateOrderAmounts(order);
    const itemPriceComparisons: Array<{
      externalLineId: string | null;
      uberItemId: string | null;
      publishedPriceCents: number | null;
      uberBasePriceCents: number;
      priceVarianceCents: number | null;
      quantity: number;
    }> = [];

    const storeId = await this.resolvePosStoreId(order.storeId ?? '');
    const txLike = this.prisma as unknown as Prisma.TransactionClient;
    const normalizedItems: NormalizedOrderItem[] = [];
    for (const item of order.items) {
      const productStableId = await this.resolveUberProductStableId(
        txLike,
        order.storeId,
        item,
        order.paidAt,
      );
      const product = await txLike.menuItem.findFirst({
        where: { stableId: productStableId },
        select: { nameEn: true, nameZh: true },
      });
      const publishedPriceCents = await this.resolvePublishedPriceCents(
        txLike,
        order.storeId,
        item.externalItemId,
        order.paidAt,
      );
      const priceVarianceCents =
        publishedPriceCents === null
          ? null
          : item.baseUnitPriceCents - publishedPriceCents;
      itemPriceComparisons.push({
        externalLineId: item.externalLineId,
        uberItemId: item.externalItemId,
        publishedPriceCents,
        uberBasePriceCents: item.baseUnitPriceCents,
        priceVarianceCents,
        quantity: item.quantity,
      });
      normalizedItems.push({
        productStableId,
        quantity: item.quantity,
        displayName: item.displayName,
        nameEn: product?.nameEn?.trim() || null,
        nameZh: product?.nameZh?.trim() || null,
        baseUnitPriceCents: item.baseUnitPriceCents,
        optionsUnitPriceCents: item.optionsUnitPriceCents,
        unitPriceCents: item.unitPriceCents,
        options: await this.toOrderOptionsSnapshot(
          txLike,
          order.storeId,
          item.modifiers,
        ),
        external: {
          itemId: item.externalItemId,
          lineId: item.externalLineId,
          instructions: item.specialInstructions,
          lineTotalCents: item.lineTotalCents,
          publishedPriceCents,
          channelBasePriceCents: item.baseUnitPriceCents,
          priceVarianceCents,
          modifiers: this.flattenUberModifiers(item.modifiers).map(
            (modifier) => ({
              externalId: modifier.externalId,
              parentExternalId: modifier.parentExternalId,
              displayName: modifier.displayName,
              quantity: modifier.quantity,
              priceDeltaCents: modifier.priceDeltaCents,
              specialInstructions: modifier.specialInstructions,
              snapshot: modifier as unknown as Prisma.InputJsonValue,
            }),
          ),
        },
      });
    }

    // Nest always injects this boundary. The fallback keeps isolated adapter
    // unit tests backwards compatible without returning to direct persistence.
    const ingestion =
      this.orderIngestionService ??
      new OrderIngestionService(
        this.prisma,
        (this.orderEventsBus ?? {
          emitOrderPaidVerified: () => undefined,
          emitOrderAccepted: () => undefined,
        }) as OrderEventsBus,
      );
    const result = await ingestion.ingest(
      {
        channel: Channel.ubereats,
        paymentMethod: PaymentMethod.UBEREATS,
        externalOrderId: order.externalOrderId,
        clientRequestId,
        storeId,
        status: mappedStatus ?? OrderStatus.pending,
        paidAt: order.paidAt,
        fulfillmentType:
          order.fulfillmentType === 'delivery'
            ? FulfillmentType.delivery
            : FulfillmentType.pickup,
        pickupCode: order.pickupCode,
        amounts: {
          subtotalCents: order.subtotalCents,
          subtotalAfterDiscountCents: Math.max(
            0,
            order.subtotalCents - order.discountCents,
          ),
          couponDiscountCents: order.discountCents,
          taxCents: order.taxCents,
          deliveryFeeCents: order.deliveryFeeCents,
          totalCents: order.totalCents,
          paymentTotalCents: order.totalCents,
        },
        contact: { name: order.contactName, phone: order.contactPhone },
        externalSnapshot: {
          displayId: order.displayId,
          notes: order.specialInstructions,
          estimatedReadyAt: order.estimatedReadyAt,
          priceVarianceCents: amountValidation.totalVarianceCents,
        },
        items: normalizedItems,
      },
      {
        verifyWebPayment: false,
        applyMembershipPoints: false,
        applyCoupons: false,
        persistExternalSnapshot: true,
        emitPaidLifecycleEvent: false,
      },
      async (tx, saved) => {
        const normalizedEvent = this.normalizeEventType(eventType);
        if (
          normalizedEvent === 'orders.cancelled' ||
          normalizedEvent === 'orders.cancel' ||
          normalizedEvent === 'orders.rejected'
        ) {
          const cancellation = order.cancellation ?? {
            cancelledBy: null,
            reasonCode: null,
            reasonDetail: null,
            occurredAt: new Date(),
          };
          await tx.uberOrderCancellation.upsert({
            where: { eventId },
            create: {
              orderId: saved.orderId,
              externalOrderId: order.externalOrderId,
              eventId,
              kind: normalizedEvent.endsWith('rejected')
                ? 'REJECTED'
                : 'CANCELLED',
              ...cancellation,
            },
            update: {},
          });

          // Uber cancellation callbacks are the settlement confirmation for
          // this integration: Uber will not settle the cancelled order. Keep
          // the audit record, financial amendment and terminal order status in
          // the same transaction. A deterministic amendmentStableId makes a
          // replay harmless even if the inbox claim is retried after a crash.
          const refundCents = Math.max(0, order.totalCents);
          await tx.orderAmendment.upsert({
            where: {
              amendmentStableId: this.uberCancellationAmendmentId(eventId),
            },
            create: {
              amendmentStableId: this.uberCancellationAmendmentId(eventId),
              orderId: saved.orderId,
              type: 'RETENDER',
              paymentMethod: PaymentMethod.UBEREATS,
              reason:
                cancellation.reasonDetail ??
                cancellation.reasonCode ??
                'Uber cancellation confirmed',
              deltaCents: -refundCents,
              refundCents,
              summaryJson: {
                kind: 'UBER_CANCELLATION',
                status: 'CONFIRMED',
                eventId,
                externalOrderId: order.externalOrderId,
              },
            },
            update: {},
          });
          await tx.order.update({
            where: { id: saved.orderId },
            data: { status: OrderStatus.refunded },
          });
        }
        await tx.uberWebhookInbox.upsert({
          where: { eventId },
          create: {
            eventId,
            eventType,
            externalOrderId: order.externalOrderId,
            status: 'PROCESSED',
            attemptCount: 1,
            processedAt: new Date(),
            payload: amountValidation as unknown as Prisma.InputJsonValue,
          },
          update: {
            status: 'PROCESSED',
            processedAt: new Date(),
            errorSummary: null,
            nextRetryAt: null,
          },
        });
      },
    );

    const menuPriceVarianceCents = itemPriceComparisons.reduce(
      (sum, item) => sum + (item.priceVarianceCents ?? 0) * item.quantity,
      0,
    );
    const hasMenuPriceVariance = itemPriceComparisons.some(
      (item) =>
        item.priceVarianceCents !== null &&
        Math.abs(item.priceVarianceCents) > 1,
    );
    if (amountValidation.hasMaterialVariance || hasMenuPriceVariance) {
      this.logger.warn(
        `[ubereats order] amount variance externalOrderId=${order.externalOrderId} line=${amountValidation.lineVarianceCents} total=${amountValidation.totalVarianceCents} menu=${menuPriceVarianceCents}`,
      );
    }
    await this.captureEvent('ubereats_order_upserted', {
      eventType,
      externalOrderId: order.externalOrderId,
      orderStableId: result.orderStableId,
      mappedStatus: result.status,
      action: result.action,
      ...amountValidation,
      priceValidationPolicy: 'WARN_AND_ACCEPT',
      hasPromotion: order.hasPromotion,
      promotionDiscountCents: order.discountCents,
      menuPriceVarianceCents,
      hasMenuPriceVariance,
      itemPriceComparisons,
    });
    return result;
  }

  private uberCancellationAmendmentId(eventId: string): string {
    return `uber_cancel_${createHash('sha256').update(eventId).digest('hex')}`;
  }

  private async resolvePosStoreId(uberStoreId: string): Promise<string> {
    const delegate = (
      this.prisma as unknown as {
        uberStoreMapping?: {
          findUnique(
            args: unknown,
          ): Promise<{ posExternalStoreId: string | null } | null>;
        };
      }
    ).uberStoreMapping;
    if (!delegate) return uberStoreId;
    const mapping = await delegate.findUnique({
      where: { uberStoreId },
      select: { posExternalStoreId: true },
    });
    return mapping?.posExternalStoreId?.trim() || uberStoreId;
  }

  private async resolvePublishedPriceCents(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    uberItemId: string | null,
    orderedAt: Date,
  ): Promise<number | null> {
    if (!storeId || !uberItemId) return null;
    const delegate = (
      tx as unknown as {
        uberPublishedMenuItem?: {
          findFirst: (args: unknown) => Promise<{
            publishedPriceCents: number;
          } | null>;
        };
      }
    ).uberPublishedMenuItem;
    if (!delegate) return null;
    const snapshot = await delegate.findFirst({
      where: {
        uberStoreId: storeId,
        uberItemId,
        publishedAt: { lte: orderedAt },
        publishVersion: {
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      select: { publishedPriceCents: true },
    });
    return snapshot?.publishedPriceCents ?? null;
  }

  private async resolveUberProductStableId(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    item: ParsedUberOrderItem,
    orderedAt: Date,
  ): Promise<string> {
    let stableId: string | null = null;
    if (item.externalItemId?.startsWith('sanq:')) {
      if (storeId) {
        const snapshot = await (
          tx as unknown as {
            uberPublishedMenuItem: {
              findFirst: (
                args: unknown,
              ) => Promise<{ menuItemStableId: string } | null>;
            };
          }
        ).uberPublishedMenuItem.findFirst({
          where: {
            uberStoreId: storeId,
            uberItemId: item.externalItemId,
            publishedAt: { lte: orderedAt },
            publishVersion: {
              status: {
                in: [
                  UberMenuPublishStatus.SUBMITTED,
                  UberMenuPublishStatus.SUCCEEDED,
                ],
              },
            },
          },
          orderBy: { publishedAt: 'desc' },
          select: { menuItemStableId: true },
        });
        if (snapshot) stableId = snapshot.menuItemStableId;
      }

      if (!stableId) {
        const localItems = await tx.menuItem.findMany({
          select: { stableId: true },
        });
        const deterministic = localItems.find(
          (candidate) =>
            this.buildStableUberNodeId(
              'item',
              storeId ?? 'default',
              candidate.stableId,
            ) === item.externalItemId,
        );
        if (deterministic) stableId = deterministic.stableId;
      }
    }

    const candidates = [item.stableIdHint, item.externalItemId].filter(
      (value): value is string => !!value,
    );
    if (!stableId && candidates.length) {
      const local = await tx.menuItem.findFirst({
        where: { stableId: { in: candidates } },
        select: { stableId: true },
      });
      if (local) stableId = local.stableId;
      const config =
        !stableId &&
        (await tx.uberItemChannelConfig.findFirst({
          where: {
            AND: [
              ...(storeId
                ? [{ OR: [{ storeId }, { uberStoreId: storeId }] }]
                : []),
              {
                OR: [
                  { externalItemId: { in: candidates } },
                  { menuItemStableId: { in: candidates } },
                ],
              },
            ],
          },
          select: { menuItemStableId: true },
        }));
      if (config) stableId = config.menuItemStableId;
    }
    if (!stableId) {
      // Historical/external items can outlive the menu/config that originally
      // published them. Keep the order consumable and let displayName remain
      // the immutable Uber snapshot used by every UI/print fallback.
      stableId =
        item.stableIdHint?.trim() ||
        item.externalItemId?.trim() ||
        `uber-unmapped-${createHash('sha256')
          .update(item.displayName)
          .digest('hex')
          .slice(0, 20)}`;
      this.logger?.warn(
        `[ubereats order] unmapped item retained externalItemId=${item.externalItemId ?? 'missing'}`,
      );
    }
    return stableId;
  }

  private flattenUberModifiers(
    items: ParsedUberModifier[],
  ): ParsedUberModifier[] {
    return items.flatMap((item) => [
      item,
      ...this.flattenUberModifiers(item.children),
    ]);
  }

  private async toOrderOptionsSnapshot(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    items: ParsedUberModifier[],
  ): Promise<Prisma.InputJsonValue> {
    return Promise.all(
      items.map(async (item, index) => {
        const group = await this.resolveUberModifierGroup(
          tx,
          storeId,
          item.parentExternalId,
        );
        const choices = await Promise.all(
          this.flattenUberModifiers([item]).map(async (choice, choiceIndex) => {
            const mapped = await this.resolveUberModifierChoice(
              tx,
              storeId,
              choice.externalId,
            );
            return {
              stableId:
                mapped?.stableId ??
                choice.externalId ??
                `uber-option-${index}-${choiceIndex}`,
              templateGroupStableId:
                group?.stableId ??
                choice.parentExternalId ??
                `uber-group-${index}`,
              nameEn: mapped?.nameEn ?? null,
              nameZh: mapped?.nameZh ?? null,
              displayName: choice.displayName,
              priceDeltaCents: choice.priceDeltaCents,
              quantity: choice.quantity,
              specialInstructions: choice.specialInstructions,
              sortOrder: choiceIndex,
            };
          }),
        );
        return {
          templateGroupStableId:
            group?.stableId ?? item.parentExternalId ?? `uber-group-${index}`,
          nameEn: group?.nameEn ?? null,
          nameZh: group?.nameZh ?? null,
          displayName: group ? null : item.displayName,
          minSelect: 0,
          maxSelect: null,
          sortOrder: index,
          choices,
        };
      }),
    );
  }

  private async resolveUberModifierGroup(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    externalId: string | null,
  ) {
    if (!externalId) return null;
    const templates = await tx.menuOptionGroupTemplate.findMany({
      select: { stableId: true, nameEn: true, nameZh: true },
    });
    let stableId = templates.find(
      (template) =>
        template.stableId === externalId ||
        this.buildStableUberNodeId(
          'group',
          storeId ?? 'default',
          template.stableId,
        ) === externalId,
    )?.stableId;
    if (!stableId) {
      const config = await tx.uberModifierGroupConfig.findFirst({
        where: {
          ...(storeId ? { OR: [{ storeId }, { uberStoreId: storeId }] } : {}),
          externalModifierGroupId: externalId,
        },
        select: { templateGroupStableId: true },
      });
      stableId = config?.templateGroupStableId;
    }
    const template = templates.find(
      (candidate) => candidate.stableId === stableId,
    );
    return template
      ? {
          stableId: template.stableId,
          nameEn: template.nameEn,
          nameZh: template.nameZh,
        }
      : null;
  }

  private async resolveUberModifierChoice(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    externalId: string | null,
  ) {
    if (!externalId) return null;
    const choices = await tx.menuOptionTemplateChoice.findMany({
      select: { stableId: true, nameEn: true, nameZh: true },
    });
    let stableId = choices.find(
      (choice) =>
        choice.stableId === externalId ||
        this.buildStableUberNodeId(
          'item',
          storeId ?? 'default',
          choice.stableId,
        ) === externalId,
    )?.stableId;
    if (!stableId) {
      const config = await tx.uberOptionItemConfig.findFirst({
        where: {
          ...(storeId ? { OR: [{ storeId }, { uberStoreId: storeId }] } : {}),
          externalItemId: externalId,
        },
        select: { optionChoiceStableId: true },
      });
      stableId = config?.optionChoiceStableId;
    }
    const choice = choices.find((candidate) => candidate.stableId === stableId);
    return choice
      ? {
          stableId: choice.stableId,
          nameEn: choice.nameEn,
          nameZh: choice.nameZh,
        }
      : null;
  }

  private validateOrderAmounts(order: ParsedUberOrder) {
    const calculatedLinesCents = order.items.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );
    const lineVarianceCents = order.subtotalCents - calculatedLinesCents;
    const calculatedTotalCents =
      order.subtotalCents -
      order.discountCents +
      order.taxCents +
      order.deliveryFeeCents;
    const totalVarianceCents = order.totalCents - calculatedTotalCents;
    const roundingToleranceCents = Math.max(1, order.items.length);
    return {
      calculatedLinesCents,
      calculatedTotalCents,
      lineVarianceCents,
      totalVarianceCents,
      roundingToleranceCents,
      hasMaterialVariance:
        Math.abs(lineVarianceCents) > roundingToleranceCents ||
        Math.abs(totalVarianceCents) > roundingToleranceCents,
    };
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return null;
    const dto = payload as UberOrderDetailDto;
    const charges = dto.payment?.charges;
    const promotions = dto.payment?.promotions;
    const externalOrderId = this.readString(
      dto.order_id,
      dto.id,
      dto.external_order_id,
    );
    const totalSource =
      dto.total ??
      dto.total_cents ??
      charges?.total ??
      charges?.total_promo_applied;
    if (!externalOrderId || totalSource === undefined) return null;
    const subtotalCents = this.readCents(
      dto.subtotal ?? dto.sub_total ?? charges?.sub_total ?? charges?.subtotal,
      dto.subtotal_cents,
      0,
    );
    const taxCents = this.readCents(
      dto.tax ?? charges?.tax_promo_applied ?? charges?.tax,
      dto.tax_cents,
      0,
    );
    const promoSubtotalCents = this.readOptionalCents(
      charges?.sub_total_promo_applied,
    );
    const promotionSavingsCents =
      promotions?.promotions?.reduce(
        (sum, promotion) =>
          sum +
          Math.max(0, promotion.promo_discount_value ?? 0) +
          Math.max(0, promotion.promo_delivery_fee_value ?? 0),
        0,
      ) ?? 0;
    const discountCents =
      dto.discount !== undefined ||
      dto.discount_cents !== undefined ||
      dto.discountCents !== undefined
        ? this.readCents(
            dto.discount,
            dto.discount_cents ?? dto.discountCents,
            0,
          )
        : promoSubtotalCents !== null
          ? Math.max(0, subtotalCents - promoSubtotalCents)
          : promotionSavingsCents;
    const hasPromotion =
      discountCents > 0 ||
      promoSubtotalCents !== null ||
      (promotions?.promotions?.length ?? 0) > 0;
    const deliveryFeeCents = this.readCents(
      dto.delivery_fee ?? charges?.total_fee ?? charges?.delivery_fee,
      undefined,
      0,
    );
    const items = (dto.items ?? dto.cart?.items ?? []).map((item) =>
      this.parseUberOrderItem(item),
    );
    const totalCents = this.readCents(
      dto.total ?? charges?.total ?? charges?.total_promo_applied,
      dto.total_cents,
      subtotalCents - discountCents + taxCents + deliveryFeeCents,
    );
    const customer = dto.customer ?? dto.eater ?? {};
    const eaterName = [
      this.readString(dto.eater?.first_name),
      this.readString(dto.eater?.last_name),
    ]
      .filter((value): value is string => !!value)
      .join(' ');
    return {
      externalOrderId,
      displayId: this.readString(dto.display_id),
      pickupCode: this.readString(dto.pickup_code, dto.display_id),
      storeId: this.readString(dto.store_id, dto.store?.id),
      subtotalCents,
      taxCents,
      totalCents,
      discountCents,
      hasPromotion,
      deliveryFeeCents,
      contactName: this.readString(
        customer.name,
        customer.full_name,
        eaterName,
      ),
      contactPhone: this.readString(customer.phone, customer.phone_number),
      paidAt:
        this.readDate(dto.paid_at, dto.created_at, dto.placed_at) ?? new Date(),
      fulfillmentType: this.readString(dto.fulfillment_type, dto.type)
        ?.toLowerCase()
        .includes('deliver')
        ? 'delivery'
        : 'pickup',
      estimatedReadyAt: this.readDate(
        dto.estimated_ready_for_pickup_at,
        dto.estimated_delivery_at,
      ),
      specialInstructions: this.readString(
        dto.special_instructions,
        dto.cart?.special_instructions,
      ),
      cancellation:
        dto.cancellation || dto.cancelled_at || dto.canceled_at
          ? {
              cancelledBy: this.readString(
                dto.cancellation?.cancelled_by,
                dto.cancellation?.canceled_by,
              ),
              reasonCode: this.readString(dto.cancellation?.reason_code),
              reasonDetail: this.readString(
                dto.cancellation?.reason,
                dto.cancellation?.details,
              ),
              occurredAt:
                this.readDate(dto.cancelled_at, dto.canceled_at) ?? new Date(),
            }
          : null,
      items,
    };
  }

  private parseUberOrderItem(item: UberOrderItemDto): ParsedUberOrderItem {
    const quantity = Math.max(1, Math.round(item.quantity ?? 1));
    const price = this.asObject(item.price);
    const modifiers = [
      ...(item.modifiers ?? []).map((modifier) =>
        this.parseUberModifier(modifier, null),
      ),
      ...(item.selected_modifier_groups ?? []).flatMap((group) =>
        (group.selected_items ?? []).map((modifier) =>
          this.parseUberModifier(modifier, group.id ?? null),
        ),
      ),
    ];
    const optionsUnitPriceCents = this.flattenUberModifiers(modifiers).reduce(
      (sum, modifier) => sum + modifier.priceDeltaCents * modifier.quantity,
      0,
    );
    const suppliedUnit = this.readCents(
      item.unit_price ?? price?.unit_price,
      item.price,
      0,
    );
    const suppliedLine = this.readCents(
      item.total_price ?? price?.total_price,
      undefined,
      suppliedUnit * quantity,
    );
    const unitPriceCents = suppliedUnit || Math.round(suppliedLine / quantity);
    return {
      externalLineId: this.readString(
        item.line_item_id,
        item.instance_id,
        item.id,
      ),
      externalItemId: this.readString(item.item_id, item.id),
      stableIdHint: this.readString(item.external_data),
      displayName:
        this.readString(item.title, item.name) ?? 'Unknown Uber item',
      quantity,
      baseUnitPriceCents: Math.max(0, unitPriceCents - optionsUnitPriceCents),
      optionsUnitPriceCents,
      unitPriceCents,
      lineTotalCents: suppliedLine,
      specialInstructions: this.readString(item.special_instructions),
      modifiers,
    };
  }

  private parseUberModifier(
    modifier: UberOrderModifierDto,
    parentExternalId: string | null,
  ): ParsedUberModifier {
    const externalId = this.readString(modifier.modifier_id, modifier.id);
    return {
      externalId,
      parentExternalId,
      displayName:
        this.readString(modifier.title, modifier.name) ?? 'Unknown modifier',
      quantity: Math.max(1, Math.round(modifier.quantity ?? 1)),
      priceDeltaCents: this.readCents(modifier.price_delta, modifier.price, 0),
      specialInstructions: this.readString(modifier.special_instructions),
      children: [
        ...(modifier.modifiers ?? []),
        ...(modifier.selected_items ?? []),
      ].map((child) => this.parseUberModifier(child, externalId)),
    };
  }

  private readEventType(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return 'unknown';
    const root = payload as Record<string, unknown>;
    return (
      this.readString(root.event_type, root.type, root.action) ?? 'unknown'
    );
  }

  private normalizeEventType(eventType: string): string {
    return eventType.trim().toLowerCase();
  }

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus | null {
    const normalized = this.normalizeEventType(eventType);

    if (normalized.includes('complete')) return OrderStatus.completed;
    if (normalized.includes('ready')) return OrderStatus.ready;
    if (normalized.includes('progress') || normalized.includes('making')) {
      return OrderStatus.making;
    }
    // Cancellation/rejection is captured separately. Refund is a local money
    // operation and must never be inferred from an Uber lifecycle event.
    if (normalized.includes('cancel') || normalized.includes('reject'))
      return null;
    if (normalized.includes('accept')) return OrderStatus.paid;
    if (normalized.includes('notification')) return OrderStatus.pending;

    return OrderStatus.pending;
  }

  private shouldAdvanceOrderStatus(
    current: OrderStatus,
    next: OrderStatus,
  ): boolean {
    const rank: Partial<Record<OrderStatus, number>> = {
      [OrderStatus.pending]: 10,
      [OrderStatus.paid]: 20,
      [OrderStatus.making]: 30,
      [OrderStatus.ready]: 40,
      [OrderStatus.completed]: 50,
      [OrderStatus.refunded]: 60,
    };

    return (rank[next] ?? 0) >= (rank[current] ?? 0);
  }

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
  }

  private tryParseJson(rawText: string): unknown {
    if (!rawText) {
      return null;
    }

    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  }

  private summarizeDebugResponse(parsed: unknown, rawText: string): string {
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify(parsed).slice(0, 500);
    }

    return rawText.slice(0, 500) || 'empty response body';
  }

  private redactSensitiveLogText(text: string): string {
    return text
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /(authorization|token)(["']?\s*[:=]\s*["']?)[^"'&,}\s]+/gi,
        '$1$2[REDACTED]',
      )
      .replace(
        /(customer|eater)?_?(phone_number|formatted_address|address|phone|name)(["']?\s*[:=]\s*["']?)[^"',}]+/gi,
        '$1$2$3[REDACTED]',
      );
  }

  private buildUberAuthenticationError(
    parsed: unknown,
    status: number,
  ): UberAuthenticationError {
    const body = this.asObject(parsed);
    const nestedError = this.asObject(body?.error);
    const code =
      this.readString(body?.code, nestedError?.code, body?.error) ??
      `UBER_HTTP_${status}`;
    const unsafeMessage =
      this.readString(
        body?.message,
        nestedError?.message,
        body?.error_description,
      ) ?? 'Uber authentication request was rejected';
    const message = unsafeMessage
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(
        /\b(access[_ -]?token|client[_ -]?secret)\s*[:=]\s*\S+/gi,
        '$1=[REDACTED]',
      )
      .slice(0, 500);

    return { upstreamStatus: status, code: code.slice(0, 100), message };
  }

  private normalizeStoreId(storeId?: string): string {
    return storeId?.trim() || 'default';
  }

  private async resolveUberStoreIdOrThrow(storeId: string): Promise<string> {
    const mappingDelegate = this.uberStoreMappingDelegate;
    if (!mappingDelegate) {
      throw new BadRequestException('Prisma 未配置 uberStoreMapping 模型');
    }

    const row = await this.prisma.uberStoreMapping.findFirst({
      where: {
        OR: [{ posExternalStoreId: storeId }, { uberStoreId: storeId }],
        isProvisioned: true,
      },
      select: { uberStoreId: true },
    });

    if (!row?.uberStoreId) {
      throw new BadRequestException(
        `未找到已 provision 的 Uber store 映射，请先完成店铺映射。storeId=${storeId}`,
      );
    }

    return row.uberStoreId;
  }

  private buildStableUberNodeId(
    nodeType: 'menu' | 'item' | 'group' | 'category' | 'publish',
    storeId: string,
    sourceStableId: string,
  ): string {
    const raw = `${nodeType}:${storeId}:${sourceStableId}`;
    return `sanq:${createHash('sha1').update(raw).digest('hex').slice(0, 24)}`;
  }

  private async ensureMenuItemExists(menuItemStableId: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { stableId: menuItemStableId },
      select: { stableId: true },
    });

    if (!menuItem) {
      throw new BadRequestException(`菜单项 ${menuItemStableId} 不存在`);
    }
  }

  private async ensureOptionChoiceExists(optionChoiceStableId: string) {
    const choice = await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId: optionChoiceStableId },
      select: { stableId: true },
    });

    if (!choice) {
      throw new BadRequestException(`选项 ${optionChoiceStableId} 不存在`);
    }
  }

  private async ensureBusinessConfig() {
    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });

    if (config) return config;

    return this.prisma.businessConfig.create({
      data: {
        id: 1,
        storeName: '',
      },
    });
  }

  private async captureEvent(eventName: string, payload: Prisma.JsonObject) {
    await this.prisma.opsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload,
      },
    });
  }

  private verifyWebhookSignature(
    headers: Record<string, unknown>,
    rawBody: string | Buffer,
  ) {
    // Uber signs the exact UTF-8 request body with the webhook signing key
    // and sends the lowercase hexadecimal HMAC-SHA256 in X-Uber-Signature.
    const receivedSignature = this.readHeader(headers, 'x-uber-signature');
    if (!receivedSignature) {
      this.logger.warn(
        'Uber webhook signature verification failed signaturePresent=false',
      );
      throw new UnauthorizedException('Missing Uber signature header');
    }

    const normalizedSignature = receivedSignature.trim().toLowerCase();
    const signatureLength = normalizedSignature.length;
    const rawBodyBytes = Buffer.isBuffer(rawBody)
      ? rawBody.length
      : Buffer.byteLength(rawBody, 'utf8');
    if (!/^[0-9a-f]{64}$/.test(normalizedSignature)) {
      this.logger.warn(
        `Uber webhook signature verification failed signaturePresent=true signatureLength=${signatureLength} signatureEncoding=invalid rawBodyBytes=${rawBodyBytes}`,
      );
      throw new UnauthorizedException('Invalid Uber signature');
    }

    const receivedBuffer = Buffer.from(normalizedSignature, 'hex');
    const currentExpectedBuffer = createHmac('sha256', this.webhookSigningKey)
      .update(rawBody)
      .digest();
    const currentSecretMatched = timingSafeEqual(
      currentExpectedBuffer,
      receivedBuffer,
    );
    if (currentSecretMatched) return;

    const diagnostic =
      `signaturePresent=true signatureLength=${signatureLength} signatureEncoding=hex rawBodyBytes=${rawBodyBytes} ` +
      `currentSecretMatched=${currentSecretMatched}`;

    this.logger.warn(
      `Uber webhook signature verification failed ${diagnostic}`,
    );
    throw new UnauthorizedException('Invalid Uber signature');
  }

  private readEventId(
    headers: Record<string, unknown>,
    payload: unknown,
    envelopeEventId?: string | null,
  ): string | null {
    const fromHeader = this.readHeader(
      headers,
      'x-request-id',
      'x-uber-request-id',
      'x-event-id',
      'uber-event-id',
    );
    if (fromHeader) return fromHeader;
    if (envelopeEventId) return envelopeEventId;

    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    return this.readString(
      root.event_id,
      root.id,
      this.asObject(root.data)?.id,
    );
  }

  private async claimWebhookEvent(
    eventId: string,
    eventType: string,
    externalOrderId: string | null,
    payload: unknown,
  ): Promise<boolean> {
    const data = {
      eventId,
      eventType,
      externalOrderId,
      status: 'RECEIVED',
      payload: this.toJsonValue(payload),
    };

    try {
      await this.prisma.uberWebhookInbox.create({ data });
    } catch (error) {
      if (!this.isPrismaUniqueConstraintError(error)) throw error;

      // A failed synchronous attempt returned non-2xx, so a later delivery is
      // allowed to atomically reclaim it. All other conflicts are idempotent
      // success, including concurrent deliveries while the owner is working.
      const reclaimed = await this.prisma.uberWebhookInbox.updateMany({
        where: {
          eventId,
          status: 'FAILED',
          nextRetryAt: { not: null },
        },
        data: {
          status: 'RECEIVED',
          errorSummary: null,
          nextRetryAt: null,
        },
      });
      if (reclaimed.count === 0) return false;
    }

    const processing = await this.prisma.uberWebhookInbox.updateMany({
      where: { eventId, status: 'RECEIVED' },
      data: {
        status: 'PROCESSING',
        processingAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
    return processing.count === 1;
  }

  private async markWebhookFailed(
    eventId: string,
    error: unknown,
    options: { retryable?: boolean } = {},
  ) {
    const retryable = options.retryable ?? true;
    const summary = this.summarizeWebhookError(error);
    await this.prisma.uberWebhookInbox.updateMany({
      where: { eventId, status: 'PROCESSING' },
      data: {
        status: 'FAILED',
        errorSummary: summary || 'unknown error',
        nextRetryAt: retryable ? new Date(Date.now() + 1_000) : null,
      },
    });
  }

  private summarizeWebhookError(error: unknown): string {
    const nestResponse =
      error &&
      typeof error === 'object' &&
      'getResponse' in error &&
      typeof (error as { getResponse?: unknown }).getResponse === 'function'
        ? (error as { getResponse: () => unknown }).getResponse()
        : null;
    const rawSummary = nestResponse
      ? JSON.stringify(nestResponse)
      : error instanceof Error
        ? error.message
        : String(error);

    return rawSummary.replace(/\s+/g, ' ').slice(0, 500) || 'unknown error';
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private isOrderRelatedEvent(eventType: string): boolean {
    return /(^|[._-])orders?([._-]|$)/i.test(eventType);
  }

  private hashCanonicalBody(payload: unknown): string {
    const normalize = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, normalize(child)]),
        );
      }
      return value;
    };
    return createHash('sha256')
      .update(JSON.stringify(normalize(payload)) ?? 'null', 'utf8')
      .digest('hex');
  }

  private toJsonValue(payload: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(payload ?? null)) as Prisma.InputJsonValue;
  }

  private extractStoreId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const dataNode = this.asObject(root.data);

    return this.readString(
      root.store_id,
      dataNode?.store_id,
      this.asObject(dataNode?.store)?.id,
    );
  }

  private readHeader(
    headers: Record<string, unknown>,
    ...keys: string[]
  ): string | null {
    const acceptedKeys = new Set(keys.map((key) => key.toLowerCase()));
    for (const [key, value] of Object.entries(headers)) {
      if (!acceptedKeys.has(key.toLowerCase())) continue;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        for (const item of value as unknown[]) {
          if (typeof item === 'string' && item.trim()) return item.trim();
        }
      }
    }
    return null;
  }

  private readDate(...values: unknown[]): Date | null {
    for (const value of values) {
      if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }
    return null;
  }

  private hashForFallback(rawBody: string): string {
    return createHmac('sha256', 'ubereats-fallback')
      .update(rawBody, 'utf8')
      .digest('hex');
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private readString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
    return null;
  }

  private readCents(
    primary: unknown,
    fallback: unknown,
    defaultValue: number,
  ): number {
    const direct = this.toFiniteNumber(primary);
    if (direct !== null) return Math.max(0, Math.round(direct));

    const money = this.asObject(primary);
    const amount = this.toFiniteNumber(money?.amount);
    if (amount !== null) return Math.max(0, Math.round(amount));
    const value = this.toFiniteNumber(money?.value);
    if (value !== null) return Math.max(0, Math.round(value));

    const second = this.toFiniteNumber(fallback);
    if (second !== null) return Math.max(0, Math.round(second));

    return Math.max(0, Math.round(defaultValue));
  }

  private readOptionalCents(value: unknown): number | null {
    const direct = this.toFiniteNumber(value);
    if (direct !== null) return Math.max(0, Math.round(direct));

    const money = this.asObject(value);
    const amount = this.toFiniteNumber(money?.amount);
    if (amount !== null) return Math.max(0, Math.round(amount));
    const nestedValue = this.toFiniteNumber(money?.value);
    if (nestedValue !== null) return Math.max(0, Math.round(nestedValue));

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
}
