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
import { UberHttpClient, UberHttpResult } from './uber-http.client';
import { UberConfigService } from './uber-config.service';
import {
  resolveUberImageUrl,
  toUberServiceAvailability,
  UBER_ITEM_DESCRIPTION_MAX_LENGTH,
} from './uber-payload.utils';

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

type UberOAuthStateRequestRecord = {
  nonce: string;
  adminSessionId: string;
  redirectUri: string;
  merchantContext: string | null;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

type UberOAuthStateRequestDelegate = {
  create(args: {
    data: Omit<UberOAuthStateRequestRecord, 'consumedAt'>;
  }): Promise<unknown>;
  findUnique(args: {
    where: { nonce: string };
  }): Promise<UberOAuthStateRequestRecord | null>;
  updateMany(args: {
    where: {
      nonce: string;
      adminSessionId: string;
      issuedAt: Date;
      expiresAt: { gt: Date };
      consumedAt: null;
    };
    data: { consumedAt: Date };
  }): Promise<{ count: number }>;
  deleteMany(args: {
    where: { expiresAt: { lte: Date } };
  }): Promise<{ count: number }>;
};

@Injectable()
export class UberMerchantService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberMerchantService.name);
  private readonly uberApiBaseUrl: string;
  private readonly uberResourceHrefAllowedOrigins: string;
  private readonly oauthStateSecret: string;
  private readonly webhookSigningKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    @Optional() private readonly orderEventsBus?: OrderEventsBus,
    @Optional() private readonly orderIngestionService?: OrderIngestionService,
    @Optional() private readonly httpClient = new UberHttpClient(),
    @Optional() private readonly config = new UberConfigService(),
  ) {
    this.uberApiBaseUrl = config.apiBaseUrl;
    this.uberResourceHrefAllowedOrigins = config.resourceHrefAllowedOrigins;
    const secret = config.oauthStateSecret;
    if (secret.length < 32 || new Set(secret).size < 12) {
      throw new Error(
        'UBER_EATS_OAUTH_STATE_SECRET 必须配置为至少 32 个字符的高熵密钥',
      );
    }
    this.oauthStateSecret = secret;

    const webhookSigningKey = config.webhookSigningKey;
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

  private get uberOAuthStateRequestDelegate(): UberOAuthStateRequestDelegate {
    const delegate = (
      this.prisma as PrismaService & {
        uberOAuthStateRequest?: UberOAuthStateRequestDelegate;
      }
    ).uberOAuthStateRequest;
    if (!delegate) {
      throw new Error('UberOAuthStateRequest 数据表不可用');
    }
    return delegate;
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

  async buildMerchantAuthorizeUrl(
    adminSessionId: string,
    merchantContext?: string,
  ) {
    const state = await this.createOAuthState(adminSessionId, merchantContext);
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

  async startMerchantOAuth(adminSessionId: string, merchantContext?: string) {
    return this.buildMerchantAuthorizeUrl(adminSessionId, merchantContext);
  }

  async exchangeAuthorizationCode(
    code: string,
    state: string | undefined,
    adminSessionId: string | undefined,
  ) {
    const stateRequest = await this.consumeOAuthState(state, adminSessionId);

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
        const { response, text: rawText } = await this.httpClient.request({
          returnErrorResponse: true,
          path: `/v1/eats/stores/${encodeURIComponent(uberStoreId)}/status`,
          baseUrl: this.uberApiBaseUrl,
          method: 'POST',
          accessToken: token,
          json: payload,
          kind: 'api',
        });
        lastStatus = response.status;
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
        description: this.redactSensitiveLogText(error).slice(0, 500),
        context: {
          uberStoreId,
          uberHttpStatus: status,
          errorCode: `UBER_HTTP_${status}`,
        },
      },
    });
  }

  private async createOAuthState(
    adminSessionId: string,
    merchantContext?: string,
  ): Promise<string> {
    if (!adminSessionId.trim()) {
      throw new UnauthorizedException('缺少发起 OAuth 的管理员会话');
    }
    const timestamp = Date.now().toString();
    const nonce = randomBytes(32).toString('base64url');
    const payload = `${timestamp}.${nonce}`;
    const signature = createHmac('sha256', this.oauthStateSecret)
      .update(payload)
      .digest('hex');
    const issuedAt = new Date(Number(timestamp));
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    // 在签发路径顺带批量清理过期记录，避免依赖单进程内存定时器。
    await this.uberOAuthStateRequestDelegate.deleteMany({
      where: { expiresAt: { lte: issuedAt } },
    });
    await this.uberOAuthStateRequestDelegate.create({
      data: {
        nonce,
        adminSessionId: adminSessionId.trim(),
        redirectUri: this.uberAuthService.getMerchantRedirectUri(),
        issuedAt,
        expiresAt,
        merchantContext: merchantContext?.trim() || null,
      },
    });
    return `${payload}.${signature}`;
  }

  private async consumeOAuthState(
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

    const request = await this.uberOAuthStateRequestDelegate.findUnique({
      where: { nonce },
    });
    if (
      !request ||
      request.issuedAt.getTime() !== issuedAt ||
      request.consumedAt
    ) {
      throw new BadRequestException('OAuth state 不存在或已使用');
    }
    if (
      !adminSessionId?.trim() ||
      request.adminSessionId !== adminSessionId.trim()
    ) {
      throw new UnauthorizedException('OAuth state 与管理员会话不匹配');
    }

    if (request.expiresAt.getTime() <= now) {
      throw new BadRequestException('OAuth state 已过期');
    }

    // 条件更新是数据库级 compare-and-set；并发回调中只有一个请求能消费成功。
    const consumed = await this.uberOAuthStateRequestDelegate.updateMany({
      where: {
        nonce,
        adminSessionId: adminSessionId.trim(),
        issuedAt: new Date(issuedAt),
        expiresAt: { gt: new Date(now) },
        consumedAt: null,
      },
      data: { consumedAt: new Date(now) },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('OAuth state 不存在或已使用');
    }
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
    const {
      response,
      text: rawText,
      data: parsed,
    } = await this.httpClient.request({
      path,
      baseUrl: this.uberApiBaseUrl,
      method: options.method,
      operation: `${options.method} ${path}`,
      accessToken: options.accessToken,
      headers: {
        ...(options.body && !options.rawBody
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.extraHeaders,
      },
      body: resolvedBody,
      kind: 'api',
    });
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
}
