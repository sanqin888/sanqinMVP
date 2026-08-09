/* eslint-disable @typescript-eslint/no-unused-vars -- Domain services retain shared runtime types while the integration is split. */
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
import { UberMerchantService } from './uber-merchant.service';

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

/* eslint-enable @typescript-eslint/no-unused-vars */

@Injectable()
export class UberOperationsService {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly logger = new AppLogger(UberOperationsService.name);
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
    @Optional() private readonly merchant?: UberMerchantService,
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
        if (!this.orders) throw new Error('UberOrderService 未配置');
        await this.orders.syncOrderStatusToUber(
          ticket.externalOrderId,
          OrderStatus.paid,
        );
      } else if (ticket.type === UberOpsTicketType.STORE_STATUS_SYNC) {
        if (!this.merchant) throw new Error('UberMerchantService 未配置');
        await this.merchant.syncStoreStatusToUber();
      } else if (ticket.type === UberOpsTicketType.MENU_PUBLISH) {
        if (!this.menu) throw new Error('UberMenuService 未配置');
        await this.menu.publishUberMenu({
          storeId: ticket.storeId,
          dryRun: false,
        });
      } else if (ticket.type === UberOpsTicketType.MENU_ITEM_AVAILABILITY) {
        if (!ticket.menuItemStableId) {
          throw new BadRequestException('商品状态工单缺少 menuItemStableId');
        }
        if (!this.menu) throw new Error('UberMenuService 未配置');
        await this.menu.syncUberMenuItemAvailability({
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

  private toClientRequestId(externalOrderId: string): string {
    return `ubereats:${externalOrderId}`;
  }

  private normalizeStoreId(storeId?: string): string {
    return storeId?.trim() || 'default';
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

  private async captureEvent(eventName: string, payload: Prisma.JsonObject) {
    await this.prisma.opsEvent.create({
      data: {
        eventName,
        source: 'ubereats',
        payload,
      },
    });
  }
}
