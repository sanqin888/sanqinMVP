//apps/api/src/integrations/ubereats/ubereats.service.ts
import {
  BadRequestException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Channel,
  OrderStatus,
  PaymentMethod,
  UberMenuPublishStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { gzipSync } from 'zlib';
import { AppLogger } from '../../common/app-logger';
import { PrismaService } from '../../prisma/prisma.service';
import { UberAuthService } from './uber-auth.service';

type UberWebhookInput = {
  headers: Record<string, unknown>;
  body: unknown;
  rawBody: string;
};

type UberMenuPublishError = {
  code: string;
  path: string | null;
  message: string;
};

type ParsedUberOrder = {
  externalOrderId: string;
  storeId?: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  contactName?: string | null;
  contactPhone?: string | null;
  paidAt: Date;
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
    price_info: { price: number };
    tax_info: { tax_rate: number };
    modifier_group_ids: string[];
    suspension_info: { suspended_until: string | null };
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
    // Equal endpoints explicitly mean all day; Uber accepts 00:00–23:59.
    if (start === end || (start === 0 && end === 1440)) {
      periods[hour.weekday].push({ start_time: '00:00', end_time: '23:59' });
    } else if (start < end) {
      periods[hour.weekday].push({
        start_time: format(start),
        end_time: end === 1440 ? '23:59' : format(end),
      });
    } else {
      periods[hour.weekday].push({
        start_time: format(start),
        end_time: '23:59',
      });
      periods[(hour.weekday + 1) % 7].push({
        start_time: '00:00',
        end_time: format(end),
      });
    }
  }

  return periods.flatMap((time_periods, weekday) =>
    time_periods.length
      ? [{ day_of_week: UBER_WEEKDAYS[weekday], time_periods }]
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

type SyncAvailabilityInput = UberStoreScopedInput & {
  menuItemStableId: string;
  isAvailable: boolean;
};

type SyncOptionAvailabilityInput = UberStoreScopedInput & {
  optionChoiceStableId: string;
  isAvailable: boolean;
};

type GenerateReconciliationReportInput = UberStoreScopedInput & {
  rangeStart?: string;
  rangeEnd?: string;
};

type VerifyScopeInput = {
  storeId?: string;
  orderId?: string;
  dryRun?: boolean;
  forceRefresh?: boolean;
};

type ScopeVerificationResult = {
  scope: string;
  tokenIssued: boolean;
  tokenError?: string;
  apiValidated?: boolean;
  apiSkipped?: boolean;
  reason?: string;
  status?: number;
  detail?: string;
};

type UberMerchantStore = {
  storeId: string;
  storeName: string | null;
  locationSummary: string | null;
  integrationEnabled: boolean;
  posExternalStoreId: string | null;
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
    process.env.UBER_EATS_API_BASE_URL?.trim() || 'https://api.uber.com';

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
  ) {}

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

  async debugAccessToken(scope?: string, forceRefresh = false) {
    const normalizedScopes = this.uberAuthService.normalizeScopesToArray(scope);
    const normalizedScope = normalizedScopes.join(' ');
    const usedDefaultScopes = !scope?.trim();
    const token = forceRefresh
      ? await this.uberAuthService.forceRefreshAccessToken(scope)
      : await this.uberAuthService.getAccessToken(scope);

    return {
      ok: true,
      requestedScope: scope?.trim() || null,
      normalizedScope,
      tokenPrefix: token.slice(0, 12),
      tokenLength: token.length,
      usedDefaultScopes,
      forceRefreshed: forceRefresh,
      cached: !forceRefresh ? 'cache_or_fetch' : 'skipped_by_force_refresh',
    };
  }

  async debugCreatedOrders(storeId?: string) {
    const normalizedStoreId = this.resolveDebugStoreId(storeId);
    const token = await this.uberAuthService.getAccessToken(
      'eats.store.orders.read',
    );
    const url = this.buildCreatedOrdersUrl(normalizedStoreId);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[ubereats debug] created-orders request failed storeId=${normalizedStoreId} message=${message}`,
      );
      throw new BadRequestException({
        ok: false,
        storeId: normalizedStoreId,
        message: '调用 Uber created-orders 接口失败',
        detail: message,
      });
    }

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText);

    if (!response.ok) {
      const detail = this.summarizeDebugResponse(parsed, rawText);
      this.logger.error(
        `[ubereats debug] created-orders upstream error storeId=${normalizedStoreId} status=${response.status} detail=${detail}`,
      );
      throw new BadRequestException({
        ok: false,
        storeId: normalizedStoreId,
        status: response.status,
        message: 'Uber created-orders 接口返回错误',
        detail,
      });
    }

    const orders = this.extractCreatedOrders(parsed);

    this.logger.log(
      `[ubereats debug] created-orders success storeId=${normalizedStoreId} count=${orders.length}`,
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      requestUrl: url,
      tokenPrefix: token.slice(0, 12),
      tokenLength: token.length,
      orderCount: orders.length,
      orders: orders.map((order) => ({
        id: order.id,
        currentState: order.current_state,
        placedAt: order.placed_at,
      })),
    };
  }

  async verifyScope(
    scope: string,
    input: VerifyScopeInput = {},
  ): Promise<ScopeVerificationResult> {
    const normalizedScope = scope.trim();
    if (!normalizedScope) {
      throw new BadRequestException('scope 不能为空');
    }

    let token = '';
    try {
      token = input.forceRefresh
        ? await this.uberAuthService.forceRefreshAccessToken(normalizedScope)
        : await this.uberAuthService.getAccessToken(normalizedScope);
    } catch (error) {
      return {
        scope: normalizedScope,
        tokenIssued: false,
        tokenError: error instanceof Error ? error.message : `${error}`,
      };
    }

    const baseResult: ScopeVerificationResult = {
      scope: normalizedScope,
      tokenIssued: true,
    };

    if (normalizedScope === 'eats.store') {
      const storeId = this.resolveDebugStoreId(input.storeId);
      return await this.verifyScopeByRequest(
        baseResult,
        `/v1/eats/stores/${encodeURIComponent(storeId)}`,
        token,
      );
    }

    if (normalizedScope === 'eats.store.orders.read') {
      try {
        const payload = await this.debugCreatedOrders(input.storeId);
        return {
          ...baseResult,
          apiValidated: true,
          status: 200,
          detail: `created-orders count=${payload.orderCount}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ...baseResult,
          apiValidated: false,
          detail: message,
        };
      }
    }

    if (normalizedScope === 'eats.store.status.write') {
      if (input.dryRun !== false) {
        return {
          ...baseResult,
          apiSkipped: true,
          reason: 'dryRun=true，跳过真实状态写入',
        };
      }

      const storeId = this.resolveDebugStoreId(input.storeId);
      return await this.verifyScopeByRequest(
        baseResult,
        `/v1/eats/stores/${encodeURIComponent(storeId)}/status`,
        token,
        'POST',
        { is_paused: false },
      );
    }

    if (normalizedScope === 'eats.order') {
      if (!input.orderId?.trim()) {
        return {
          ...baseResult,
          apiSkipped: true,
          reason: 'missing orderId',
        };
      }

      return await this.verifyScopeByRequest(
        baseResult,
        `/v1/eats/orders/${encodeURIComponent(input.orderId.trim())}/accept-pos-order`,
        token,
        'POST',
        {},
      );
    }

    if (normalizedScope === 'eats.report') {
      return {
        ...baseResult,
        apiSkipped: true,
        reason: 'reporting endpoint 待接入',
      };
    }

    return {
      ...baseResult,
      apiSkipped: true,
      reason: '未配置该 scope 的最小 API 校验',
    };
  }

  async verifyScopes(scopes?: string[], input: VerifyScopeInput = {}) {
    const requestedScopes =
      scopes?.filter((scope) => typeof scope === 'string' && scope.trim()) ??
      [];
    const finalScopes =
      requestedScopes.length > 0
        ? requestedScopes
        : this.uberAuthService.getDefaultAppScopes();

    const results: ScopeVerificationResult[] = [];
    for (const scope of finalScopes) {
      const result = await this.verifyScope(scope, input);
      results.push(result);
    }

    return {
      ok: results.every((item) => item.tokenIssued),
      storeId:
        input.storeId?.trim() || process.env.UBER_EATS_STORE_ID?.trim() || null,
      results,
    };
  }

  buildMerchantAuthorizeUrl() {
    const state = this.createOAuthState();
    const authorizeUrl = this.uberAuthService.buildMerchantAuthorizeUrl(state);

    this.logger.log(
      `[ubereats oauth start] stateIssued=${state.slice(0, 24)}... authorizeEndpointReady=true`,
    );

    return {
      ok: true,
      state,
      authorizeUrl,
    };
  }

  startMerchantOAuth() {
    return this.buildMerchantAuthorizeUrl();
  }

  async exchangeAuthorizationCode(code: string, state?: string) {
    this.verifyOAuthState(state);

    const tokenResult =
      await this.uberAuthService.exchangeAuthorizationCode(code);

    this.logger.log(
      `[ubereats oauth] accessToken=${tokenResult.accessToken.slice(0, 16)}...${tokenResult.accessToken.slice(-10)} scope=${tokenResult.scope ?? 'null'} tokenType=${tokenResult.tokenType ?? 'null'} expiresAt=${tokenResult.expiresAt?.toISOString() ?? 'null'}`,
    );

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
      })),
      raw: response,
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

    const eventType = this.readEventType(input.body);
    const eventId =
      this.readEventId(input.headers, input.body) ??
      `no-event-id:${eventType}:${this.hashForFallback(input.rawBody)}`;

    this.logger.log(
      `[ubereats webhook] eventType=${eventType} eventId=${eventId} bodyLength=${input.rawBody.length}`,
    );

    const alreadySeen = await this.hasSeenWebhookEvent(eventId);
    if (alreadySeen) {
      this.logger.warn(
        `[ubereats webhook] duplicate ignored eventType=${eventType} eventId=${eventId}`,
      );
      return;
    }

    switch (this.normalizeEventType(eventType)) {
      case 'orders.notification':
      case 'orders.accepted':
      case 'orders.in_progress':
      case 'orders.making':
      case 'orders.ready_for_pickup':
      case 'orders.completed':
      case 'orders.cancelled':
      case 'orders.rejected':
        await this.handleOrderWebhook(eventType, eventId, input.body);
        return;

      case 'store.provisioned':
        await this.handleStoreProvisionedWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      case 'store.deprovisioned':
        await this.handleStoreDeprovisionedWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      case 'store.status.changed':
        await this.handleStoreStatusChangedWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      case 'menu.notification':
      case 'menus.notification':
      case 'store.menu.updated':
        await this.handleMenuNotificationWebhook(
          eventType,
          eventId,
          input.body,
        );
        return;

      default:
        await this.captureEvent('ubereats_webhook_unhandled', {
          eventType,
          eventId,
        });
        return;
    }
  }

  async syncOrderStatusToUber(externalOrderId: string, status: OrderStatus) {
    const clientRequestId = this.toClientRequestId(externalOrderId);
    const order = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: { id: true, orderStableId: true },
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

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { status },
      select: { orderStableId: true, status: true },
    });

    await this.captureEvent('ubereats_order_status_synced', {
      externalOrderId,
      orderStableId: updated.orderStableId,
      status,
    });

    return {
      ok: true,
      externalOrderId,
      orderStableId: updated.orderStableId,
      status: updated.status,
    };
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

    const payload = {
      isOpen: !config.isTemporarilyClosed,
      isTemporarilyClosed: config.isTemporarilyClosed,
      temporaryCloseReason: config.temporaryCloseReason,
      updatedAt: config.updatedAt,
    };

    await this.captureEvent('ubereats_store_status_synced', {
      ...payload,
      updatedAt: payload.updatedAt.toISOString(),
    });

    return {
      ok: true,
      payload,
    };
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
    const payloadValidation = this.validateUberMenuPayload(payload);
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
        payload,
        mappingErrors: graph.mappingErrors,
        validation: {
          warnings: normalized.warnings,
          errors: validationErrors,
        },
      };
    }

    const version = await this.createMenuPublishVersionStarted(
      normalizedStoreId,
      uberStoreId,
      summary,
      payload,
    );

    try {
      const response = await this.uploadUberMenu(uberStoreId, payload);
      await this.markMenuPublishVersionSubmitted(version.id, response);

      let finalStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED' = 'SUBMITTED';
      if (!this.hasMenuNotificationCapability()) {
        finalStatus = await this.confirmUploadedMenu(
          version.id,
          uberStoreId,
          payload,
        );
        if (finalStatus === 'SUCCEEDED') {
          await this.backfillPublishedStateFromGraph(
            normalizedStoreId,
            uberStoreId,
            normalized.graph,
          );
        }
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

  async syncUberMenuItemAvailability(input: SyncAvailabilityInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureMenuItemExists(input.menuItemStableId);

    const itemConfig = await this.prisma.uberItemChannelConfig.findUnique({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
    });

    if (!itemConfig) {
      throw new BadRequestException(
        `未找到 ${input.menuItemStableId} 的 Uber 商品配置，请先配置`,
      );
    }

    const updated = await this.prisma.uberItemChannelConfig.update({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
      data: {
        isAvailable: input.isAvailable,
      },
      select: {
        menuItemStableId: true,
        isAvailable: true,
        updatedAt: true,
      },
    });

    await this.captureEvent('ubereats_menu_item_availability_synced', {
      storeId: normalizedStoreId,
      menuItemStableId: input.menuItemStableId,
      isAvailable: updated.isAvailable,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      item: updated,
    };
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

  private createOAuthState(): string {
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const secret =
      process.env.UBER_EATS_OAUTH_STATE_SECRET?.trim() ||
      'ubereats-oauth-state';
    const payload = `${timestamp}.${nonce}`;
    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return `${payload}.${signature}`;
  }

  private verifyOAuthState(state?: string): void {
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

    const secret =
      process.env.UBER_EATS_OAUTH_STATE_SECRET?.trim() ||
      'ubereats-oauth-state';
    const expected = createHmac('sha256', secret)
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

    const maxAgeMs = 10 * 60 * 1000;
    if (Date.now() - issuedAt > maxAgeMs) {
      throw new BadRequestException('OAuth state 已过期');
    }
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
        ...(posExternalStoreId ? { posExternalStoreId } : {}),
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
      throw new BadRequestException({
        ok: false,
        status: response.status,
        detail: this.summarizeDebugResponse(parsed, rawText),
      });
    }

    return this.asObject(parsed) ?? {};
  }

  private async verifyScopeByRequest(
    baseResult: ScopeVerificationResult,
    path: string,
    token: string,
    method: 'GET' | 'POST' = 'GET',
    body?: Record<string, unknown>,
  ): Promise<ScopeVerificationResult> {
    const response = await fetch(
      `${this.uberApiBaseUrl.replace(/\/$/, '')}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );

    const rawText = await response.text();
    const parsed = this.tryParseJson(rawText);

    if (!response.ok) {
      return {
        ...baseResult,
        apiValidated: false,
        status: response.status,
        detail: this.summarizeDebugResponse(parsed, rawText),
      };
    }

    return {
      ...baseResult,
      apiValidated: true,
      status: response.status,
    };
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
    payload: unknown,
  ) {
    const parsedOrder = this.parseOrderPayload(payload);

    if (!parsedOrder) {
      await this.captureEvent('ubereats_order_webhook_parse_failed', {
        eventType,
        eventId,
      });
      return;
    }

    const order = await this.upsertUberOrder(parsedOrder, eventType);

    await this.captureEvent('ubereats_webhook_processed', {
      eventType,
      eventId,
      externalOrderId: parsedOrder.externalOrderId,
      orderStableId: order.orderStableId,
      storeId: parsedOrder.storeId ?? this.normalizeStoreId(undefined),
    });
  }

  private async handleMenuNotificationWebhook(
    eventType: string,
    eventId: string,
    payload: unknown,
  ) {
    const root = this.asObject(payload) ?? {};
    const data = this.asObject(root.data) ?? root;
    const meta = this.asObject(root.meta) ?? {};
    const uberStoreId = this.readString(
      data.store_id,
      data.storeId,
      meta.resource_id,
      root.store_id,
    );
    const versionStableId = this.readString(
      data.version_id,
      data.versionStableId,
      data.client_reference_id,
    );
    const status = (
      this.readString(data.status, data.state, root.status) ?? ''
    ).toUpperCase();
    const errors = this.extractMenuPublishErrors(data);
    const version = await this.prisma.uberMenuPublishVersion.findFirst({
      where: {
        status: UberMenuPublishStatus.SUBMITTED,
        ...(versionStableId
          ? { versionStableId }
          : uberStoreId
            ? { uberStoreId }
            : { id: '__missing_menu_notification_identity__' }),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (version && /^(SUCCESS|SUCCEEDED|COMPLETED|PUBLISHED)$/.test(status)) {
      await this.markMenuPublishVersionSuccess(version.id, data);
    } else if (
      version &&
      (/^(FAIL|FAILED|FAILURE|REJECTED)$/.test(status) || errors.length > 0)
    ) {
      await this.markMenuPublishVersionFailed(
        version.id,
        errors.map((error) => error.message).join('; ') || 'Uber 菜单处理失败',
        errors,
      );
    }

    await this.captureEvent('ubereats_menu_notification_processed', {
      eventType,
      eventId,
      uberStoreId: uberStoreId ?? 'unknown',
      status: status || 'unknown',
      matchedVersion: Boolean(version),
      errors: errors as unknown as Prisma.JsonArray,
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
        description: itemConfig?.displayDescription || null,
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
      if (item.image_url !== undefined) {
        const imagePath = `$.items[${ii}].image_url`;
        if (!isPermanentPublicHttpsUrl(item.image_url))
          error(
            'UBER_IMAGE_URL_INVALID',
            imagePath,
            item.id,
            `图片地址必须是不超过 ${UBER_IMAGE_URL_MAX_LENGTH} 个字符、不含临时签名的永久公网 HTTPS URL。`,
          );
        else
          warning(
            'UBER_IMAGE_METADATA_UNVERIFIED',
            imagePath,
            item.id,
            '未下载远程图片，无法确认内容类型和文件大小；这不会阻断发布。',
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
      item.modifier_group_ids.forEach((id, gi) => {
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
      if (optionIds.has(item.id) && item.modifier_group_ids.length)
        error(
          'UBER_OPTION_ITEM_HAS_MODIFIER_GROUP',
          `$.items[${ii}].modifier_group_ids`,
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
        if (
          !day.day_of_week ||
          !time.test(period.start_time ?? '') ||
          !time.test(period.end_time ?? '') ||
          period.start_time >= period.end_time
        )
          error(
            'UBER_SERVICE_AVAILABILITY_INVALID',
            `$.menus[0].service_availability[${di}].time_periods[${pi}]`,
            null,
            '营业时段必须包含星期，并使用有效且起始早于结束的 HH:mm 时间。',
          );
      }),
    );
    return issues;
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
        price_info: { price: item.priceCents },
        tax_info: { tax_rate: taxRatePercentage },
        modifier_group_ids:
          item.sourceType === 'OPTION_ITEM' ? [] : item.modifierGroupIds,
        suspension_info: {
          suspended_until: item.isAvailable ? null : '2099-01-01T00:00:00Z',
        },
        ...(item.sourceType === 'MENU_ITEM' &&
        item.imageUrl &&
        isPermanentPublicHttpsUrl(item.imageUrl)
          ? { image_url: item.imageUrl }
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
    return { timezone, serviceAvailability, taxRatePercentage };
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
    const connection = await this.resolveMerchantConnection();
    const rawJson = JSON.stringify(payload);
    const gzipped = gzipSync(rawJson);

    return this.callUberApi(
      `/v2/eats/stores/${encodeURIComponent(uberStoreId)}/menus`,
      {
        accessToken: connection.accessToken,
        method: 'PUT',
        rawBody: gzipped,
        extraHeaders: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
        },
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
      const connection = await this.resolveMerchantConnection();
      const response = await this.callUberApi(
        `/v2/eats/stores/${encodeURIComponent(uberStoreId)}/menus`,
        { accessToken: connection.accessToken, method: 'GET' },
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

  private async createMenuPublishVersionStarted(
    storeId: string,
    uberStoreId: string,
    summary: { totalItems: number; changedItems: number },
    payload: UberMenuUploadPayload,
  ) {
    const checksum = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const version = await this.prisma.uberMenuPublishVersion.create({
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

  private async upsertUberOrder(order: ParsedUberOrder, eventType: string) {
    const clientRequestId = this.toClientRequestId(order.externalOrderId);
    const mappedStatus = this.mapEventTypeToOrderStatus(eventType);

    const existing = await this.prisma.order.findUnique({
      where: { clientRequestId },
      select: {
        id: true,
        orderStableId: true,
        status: true,
      },
    });

    if (!existing) {
      const created = await this.prisma.order.create({
        data: {
          channel: Channel.ubereats,
          clientRequestId,
          status: mappedStatus,
          paidAt: order.paidAt,
          paymentMethod: PaymentMethod.UBEREATS,
          subtotalCents: order.subtotalCents,
          taxCents: order.taxCents,
          totalCents: order.totalCents,
          paymentTotalCents: order.totalCents,
          contactName: order.contactName,
          contactPhone: order.contactPhone,
        },
        select: {
          orderStableId: true,
          status: true,
        },
      });

      await this.captureEvent('ubereats_order_upserted', {
        eventType,
        externalOrderId: order.externalOrderId,
        orderStableId: created.orderStableId,
        mappedStatus: created.status,
        action: 'created',
      });

      return { orderStableId: created.orderStableId };
    }

    const nextStatus = this.shouldAdvanceOrderStatus(
      existing.status,
      mappedStatus,
    )
      ? mappedStatus
      : existing.status;

    const updated = await this.prisma.order.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        subtotalCents: order.subtotalCents,
        taxCents: order.taxCents,
        totalCents: order.totalCents,
        paymentTotalCents: order.totalCents,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
      },
      select: {
        orderStableId: true,
        status: true,
      },
    });

    await this.captureEvent('ubereats_order_upserted', {
      eventType,
      externalOrderId: order.externalOrderId,
      orderStableId: updated.orderStableId,
      mappedStatus,
      finalStatus: updated.status,
      action: 'updated',
    });

    return { orderStableId: updated.orderStableId };
  }

  private parseOrderPayload(payload: unknown): ParsedUberOrder | null {
    if (!payload || typeof payload !== 'object') return null;

    const root = payload as Record<string, unknown>;
    const dataNode = this.asObject(root.data);
    const orderNode =
      this.asObject(root.order) ?? this.asObject(dataNode?.order) ?? dataNode;

    if (!orderNode) return null;

    const externalOrderId = this.readString(
      orderNode.order_id,
      orderNode.id,
      orderNode.external_order_id,
      orderNode.display_id,
    );
    if (!externalOrderId) return null;

    const subtotalCents = this.readCents(
      orderNode.subtotal,
      orderNode.subtotal_cents,
      0,
    );
    const taxCents = this.readCents(orderNode.tax, orderNode.tax_cents, 0);
    const totalCents = this.readCents(
      orderNode.total,
      orderNode.total_cents,
      subtotalCents + taxCents,
    );

    const customer =
      this.asObject(orderNode.customer) ??
      this.asObject(orderNode.eater) ??
      orderNode;

    const paidAt = this.readDate(
      orderNode.paid_at,
      orderNode.created_at,
      orderNode.placed_at,
      root.created_at,
    );

    return {
      externalOrderId,
      storeId:
        this.readString(
          orderNode.store_id,
          dataNode?.store_id,
          root.store_id,
        ) ?? null,
      subtotalCents,
      taxCents,
      totalCents,
      contactName: this.readString(customer.name, customer.full_name),
      contactPhone: this.readString(customer.phone, customer.phone_number),
      paidAt: paidAt ?? new Date(),
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

  private mapEventTypeToOrderStatus(eventType: string): OrderStatus {
    const normalized = this.normalizeEventType(eventType);

    if (normalized.includes('complete')) return OrderStatus.completed;
    if (normalized.includes('ready')) return OrderStatus.ready;
    if (normalized.includes('progress') || normalized.includes('making')) {
      return OrderStatus.making;
    }
    if (normalized.includes('cancel') || normalized.includes('reject')) {
      return OrderStatus.refunded;
    }
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

  private resolveDebugStoreId(storeId?: string): string {
    const normalizedStoreId =
      storeId?.trim() || process.env.UBER_EATS_STORE_ID?.trim();

    if (!normalizedStoreId) {
      throw new BadRequestException(
        '缺少 storeId，请通过 query 传入或配置 UBER_EATS_STORE_ID',
      );
    }

    return normalizedStoreId;
  }

  private buildCreatedOrdersUrl(storeId: string): string {
    const base = this.uberApiBaseUrl.replace(/\/$/, '');
    return `${base}/v1/eats/stores/${encodeURIComponent(storeId)}/created-orders`;
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

  private extractCreatedOrders(
    payload: unknown,
  ): Array<{ id?: string; current_state?: string; placed_at?: string }> {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const orders = (payload as { orders?: unknown }).orders;
    if (!Array.isArray(orders)) {
      return [];
    }

    return orders
      .filter(
        (order): order is Record<string, unknown> =>
          !!order && typeof order === 'object',
      )
      .map((order) => ({
        id: typeof order.id === 'string' ? order.id : undefined,
        current_state:
          typeof order.current_state === 'string'
            ? order.current_state
            : undefined,
        placed_at:
          typeof order.placed_at === 'string' ? order.placed_at : undefined,
      }));
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
    rawBody: string,
  ) {
    const clientSecret = process.env.UBER_EATS_CLIENT_SECRET?.trim();
    const webhookSigningKey = process.env.UBER_EATS_WEBHOOK_SIGNING_KEY?.trim();
    const candidateSecrets = [
      clientSecret,
      webhookSigningKey && webhookSigningKey !== clientSecret
        ? webhookSigningKey
        : null,
    ].filter((secret): secret is string => !!secret);

    if (!candidateSecrets.length) {
      throw new Error(
        'UBER_EATS_CLIENT_SECRET 或 UBER_EATS_WEBHOOK_SIGNING_KEY 未配置',
      );
    }

    const receivedSignature = this.readHeader(
      headers,
      'x-uber-signature',
      'x-uber-eats-signature',
    );

    if (!receivedSignature) {
      throw new UnauthorizedException('Missing Uber signature header');
    }

    const receivedBuffer = Buffer.from(receivedSignature.trim(), 'utf8');
    const isMatched = candidateSecrets.some((secret) => {
      const expected = createHmac('sha256', secret)
        .update(rawBody, 'utf8')
        .digest('hex');

      const expectedBuffer = Buffer.from(expected, 'utf8');

      return (
        expectedBuffer.length === receivedBuffer.length &&
        timingSafeEqual(expectedBuffer, receivedBuffer)
      );
    });

    if (!isMatched) {
      throw new UnauthorizedException('Invalid Uber signature');
    }
  }

  private readEventId(
    headers: Record<string, unknown>,
    payload: unknown,
  ): string | null {
    const fromHeader = this.readHeader(
      headers,
      'x-request-id',
      'x-uber-request-id',
      'x-event-id',
      'uber-event-id',
    );
    if (fromHeader) return fromHeader;

    if (!payload || typeof payload !== 'object') return null;
    const root = payload as Record<string, unknown>;
    return this.readString(
      root.event_id,
      root.id,
      this.asObject(root.data)?.id,
    );
  }

  private async hasSeenWebhookEvent(eventId: string): Promise<boolean> {
    const row = await this.prisma.opsEvent.findFirst({
      where: {
        source: 'ubereats',
        eventName: 'ubereats_webhook_processed',
        payload: {
          path: ['eventId'],
          equals: eventId,
        },
      },
      select: { id: true },
    });

    return !!row;
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
    for (const key of keys) {
      const direct = headers[key];
      const lower = headers[key.toLowerCase()];
      const upper = headers[key.toUpperCase()];
      const value = direct ?? lower ?? upper;

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value)) {
        const values = value as unknown[];
        const first = values.find(
          (item: unknown) => typeof item === 'string' && item.trim(),
        );
        if (typeof first === 'string') return first.trim();
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

    const second = this.toFiniteNumber(fallback);
    if (second !== null) return Math.max(0, Math.round(second));

    return Math.max(0, Math.round(defaultValue));
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
