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
import { UberOrderService } from './uber-order.service';
import { UberMenuService } from './uber-menu.service';

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
export class UberWebhookService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberWebhookService.name);
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
    @Optional() private readonly orders?: UberOrderService,
    @Optional() private readonly menu?: UberMenuService,
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
          if (!this.orders) throw new Error('UberOrderService 未配置');
          await this.orders.processWebhookEvent(eventType, eventId, envelope);
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
          if (!this.menu) throw new Error('UberMenuService 未配置');
          await this.menu.processWebhookEvent(eventType, eventId, body);
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
      const retryable =
        !nonRetryable &&
        (!error ||
          typeof error !== 'object' ||
          !('retryable' in error) ||
          (error as { retryable?: unknown }).retryable === true);
      await this.markWebhookFailed(eventId, error, {
        retryable,
      });
      if (!retryable) {
        await this.captureEvent('ubereats_webhook_non_retryable_failed', {
          eventType,
          eventId,
          ...(nonRetryable
            ? { status: error.status, detail: error.detail }
            : this.safeStructuredError(error)),
        });
        return;
      }
      throw error;
    }
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
    const structured = this.safeStructuredError(error);
    if (structured.code) {
      return `${structured.code}: ${structured.detail ?? 'Uber request failed'}`.slice(
        0,
        500,
      );
    }
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

    return this.redactSensitiveLogText(rawSummary).slice(0, 500);
  }

  private safeStructuredError(error: unknown): {
    code?: string;
    detail?: string;
    operation?: string;
  } {
    if (!error || typeof error !== 'object') return {};
    const value = error as Record<string, unknown>;
    return {
      ...(typeof value.uberCode === 'string' ? { code: value.uberCode } : {}),
      ...(typeof value.safeDetail === 'string'
        ? { detail: this.redactSensitiveLogText(value.safeDetail) }
        : {}),
      ...(typeof value.operation === 'string'
        ? { operation: value.operation }
        : {}),
    };
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
