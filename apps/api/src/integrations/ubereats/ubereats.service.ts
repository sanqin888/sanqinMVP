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
  categoryId?: string;
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
};

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
        tokenError: error instanceof Error ? error.message : String(error),
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
          mappingByStoreId.get(store.storeId)?.isProvisioned ?? false,
        provisionedAt:
          mappingByStoreId.get(store.storeId)?.provisionedAt ?? null,
        posExternalStoreId:
          mappingByStoreId.get(store.storeId)?.posExternalStoreId ?? null,
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
    const summary = this.summarizePublishGraph(graph);
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
        },
      });

    const groupMap = new Map(graph.groups.map((group) => [group.id, group]));
    const itemMap = new Map(graph.items.map((item) => [item.id, item]));
    const uberDraftCategories = graph.categories.map((category) => ({
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
                      .filter(Boolean),
                  })),
              };
            })
            .filter(Boolean),
        })),
    }));

    return {
      storeId: normalizedStoreId,
      sourceMenu: {
        categories: graph.categories.length,
        items: graph.items.filter((item) => item.sourceType === 'MENU_ITEM')
          .length,
        optionItems: graph.items.filter(
          (item) => item.sourceType === 'OPTION_ITEM',
        ).length,
        groups: graph.groups.length,
      },
      uberDraft: {
        menuId: graph.menuId,
        categories: graph.categories,
        items: graph.items,
        groups: graph.groups,
        edges: this.buildUberDraftEdges(graph),
        tree: {
          categories: uberDraftCategories,
        },
      },
      mappingWarnings: [
        ...(storeMapping?.uberStoreId
          ? []
          : ['当前门店尚未完成 Uber store provision，返回的是本地 draft 图。']),
      ],
      publishSummary: summary,
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
        externalCategoryId: input.categoryId?.trim() || null,
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
        ...(input.categoryId !== undefined
          ? { externalCategoryId: input.categoryId?.trim() || null }
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
      select: { id: true, stableId: true },
    });
    if (!parentChoice) {
      throw new BadRequestException(`选项 ${optionItemId} 不存在`);
    }

    const childGroup = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: {
        id: true,
        stableId: true,
        options: {
          where: { deletedAt: null },
          select: { id: true, stableId: true },
        },
      },
    });
    if (!childGroup) {
      throw new BadRequestException(`模板组 ${groupId} 不存在`);
    }

    if (!childGroup.options.length) {
      throw new BadRequestException(`模板组 ${groupId} 下没有可绑定的选项`);
    }

    await this.prisma.menuOptionChoiceLink.createMany({
      data: childGroup.options.map((option) => ({
        parentOptionId: parentChoice.id,
        childOptionId: option.id,
      })),
      skipDuplicates: true,
    });

    await this.captureEvent('ubereats_draft_option_child_group_bound', {
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      childOptionCount: childGroup.options.length,
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
      select: { id: true },
    });
    if (!parentChoice) {
      throw new BadRequestException(`选项 ${optionItemId} 不存在`);
    }

    const childGroup = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: { id: true },
    });
    if (!childGroup) {
      throw new BadRequestException(`模板组 ${groupId} 不存在`);
    }

    const deleted = await this.prisma.menuOptionChoiceLink.deleteMany({
      where: {
        parentOptionId: parentChoice.id,
        childOption: {
          templateGroupId: childGroup.id,
        },
      },
    });

    await this.captureEvent('ubereats_draft_option_child_group_unbound', {
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      deletedCount: deleted.count,
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      deletedCount: deleted.count,
    };
  }

  async getUberMenuDraftDiff(storeId?: string) {
    const normalizedStoreId = this.normalizeStoreId(storeId);
    const draft = await this.getUberMenuDraft(normalizedStoreId);
    const lastSuccess = await this.prisma.uberMenuPublishVersion.findFirst({
      where: {
        storeId: normalizedStoreId,
        status: UberMenuPublishStatus.SUCCESS,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
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
      deletedItems: [] as string[],
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
      hierarchyChanges: draft.uberDraft.edges,
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
    const graph = await this.buildUberMenuGraph(normalizedStoreId, uberStoreId);
    const payload = this.buildUberUploadMenuPayload(graph);
    const summary = this.summarizePublishGraph(graph);

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
        payload,
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
      await this.markMenuPublishVersionSuccess(version.id, response);
      await this.backfillPublishedStateFromGraph(
        normalizedStoreId,
        uberStoreId,
        graph,
      );

      await this.captureEvent('ubereats_menu_published', {
        storeId: normalizedStoreId,
        uberStoreId,
        versionStableId: version.versionStableId,
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
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  async syncUberMenuItemAvailability(input: SyncAvailabilityInput) {
    const normalizedStoreId = this.normalizeStoreId(input.storeId);
    await this.ensureMenuItemExists(input.menuItemStableId);

    const priceBookItem = await this.prisma.uberItemChannelConfig.findUnique({
      where: {
        storeId_menuItemStableId: {
          storeId: normalizedStoreId,
          menuItemStableId: input.menuItemStableId,
        },
      },
    });

    if (!priceBookItem) {
      throw new BadRequestException(
        `未找到 ${input.menuItemStableId} 的 Uber 价目表配置，请先配置 price book`,
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
        isProvisioned: false,
        provisionedAt: null,
        posExternalStoreId: null,
        rawPayload,
      },
      update: {
        merchantUberUserId: input.merchantUberUserId,
        storeName: input.storeName ?? null,
        locationSummary: input.locationSummary ?? null,
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
        raw: store,
      }));
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
    const [
      categories,
      menuItems,
      templates,
      itemConfigs,
      optionConfigs,
      modifierGroupConfigs,
      categoryConfigs,
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
        where: { deletedAt: null },
        select: {
          id: true,
          stableId: true,
          categoryId: true,
          nameEn: true,
          nameZh: true,
          basePriceCents: true,
          isAvailable: true,
          sortOrder: true,
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
    }> = [];

    for (const template of templates) {
      const groupConfig = groupConfigMap.get(template.stableId);
      const groupId = this.buildStableUberNodeId(
        'group',
        storeId,
        template.stableId,
      );
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
        const childGroupIds = Array.from(
          new Set(
            choice.childLinks.map((link) =>
              this.buildStableUberNodeId(
                'group',
                storeId,
                link.childOption.templateGroup.stableId,
              ),
            ),
          ),
        );

        optionItemIds.push(optionItemId);
        optionItemDraftMap.set(choice.stableId, {
          id: optionItemId,
          sourceType: 'OPTION_ITEM',
          sourceStableId: choice.stableId,
          title: optionConfig?.displayName || choice.nameEn,
          description: optionConfig?.displayDescription || null,
          basePriceCents: choice.priceDeltaCents,
          priceCents: optionPriceCents,
          isAvailable: optionAvailable,
          modifierGroupIds: childGroupIds,
          hasDelta:
            optionPriceCents !== choice.priceDeltaCents ||
            optionAvailable !== choice.isAvailable,
        });
      }

      groupDraftMap.set(template.stableId, {
        id: groupId,
        sourceStableId: template.stableId,
        title: groupConfig?.displayName || template.nameEn,
        minSelect,
        maxSelect,
        isAvailable: template.isAvailable,
        optionItemIds,
      });
    }

    for (const menuItem of menuItems) {
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
        title: itemConfig?.displayName || menuItem.nameEn,
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
      });
    }

    const categoryDrafts = categories
      .map((category) => {
        const categoryConfig = categoryConfigMap.get(category.stableId);
        const categoryActive = categoryConfig?.isActive ?? category.isActive;
        if (!categoryActive) return null;

        const categoryItemIds = itemDrafts
          .filter((item) => item.categoryStableId === category.stableId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item) => item.id);
        if (!categoryItemIds.length) return null;

        return {
          id: this.buildStableUberNodeId(
            'category',
            storeId,
            category.stableId,
          ),
          sourceStableId: category.stableId,
          title: categoryConfig?.displayName || category.nameEn,
          sortOrder: categoryConfig?.sortOrder ?? category.sortOrder,
          entities: categoryItemIds,
        };
      })
      .filter((category): category is NonNullable<typeof category> =>
        Boolean(category),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      menuId: this.buildStableUberNodeId('menu', storeId, uberStoreId),
      categories: categoryDrafts,
      items: [...itemDrafts, ...optionItemDraftMap.values()],
      groups: Array.from(groupDraftMap.values()),
    };
  }

  private buildUberUploadMenuPayload(graph: {
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
    }>;
    groups: Array<{
      id: string;
      title: string;
      minSelect: number;
      maxSelect: number;
      optionItemIds: string[];
    }>;
  }): Record<string, unknown> {
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
        },
      ],
      categories: graph.categories.map((category) => ({
        id: category.id,
        title: { translations: { en_us: category.title } },
        entities: category.entities,
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
        modifier_group_ids: item.modifierGroupIds,
        suspension_info: {
          suspended_until: item.isAvailable ? null : '2099-01-01T00:00:00Z',
        },
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
            max_permitted: Math.max(group.minSelect, group.maxSelect),
          },
        },
        modifier_options: group.optionItemIds.map((optionItemId) => ({
          type: 'ITEM',
          id: optionItemId,
        })),
      })),
    };
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
    payload: Record<string, unknown>,
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

  private async createMenuPublishVersionStarted(
    storeId: string,
    uberStoreId: string,
    summary: { totalItems: number; changedItems: number },
    payload: Record<string, unknown>,
  ) {
    const checksum = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const version = await this.prisma.uberMenuPublishVersion.create({
      data: {
        storeId,
        uberStoreId,
        status: UberMenuPublishStatus.IN_PROGRESS,
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

  private async markMenuPublishVersionSuccess(
    id: string,
    responsePayload: Record<string, unknown>,
  ) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id },
      data: {
        status: UberMenuPublishStatus.SUCCESS,
        responsePayload: responsePayload as Prisma.InputJsonValue,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
  }

  private async markMenuPublishVersionFailed(id: string, errorMessage: string) {
    await this.prisma.uberMenuPublishVersion.update({
      where: { id },
      data: {
        status: UberMenuPublishStatus.FAILED,
        errorMessage,
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
