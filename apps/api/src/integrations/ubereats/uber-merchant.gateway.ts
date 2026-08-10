import {
  BadRequestException,
  Inject,
  Injectable,
  NotImplementedException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UberAuthService } from './uber-auth.service';
import {
  UberConfigService,
  type UberOAuthStateConfig,
} from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import {
  redactUberLogText,
  summarizeUberDebugResponse,
} from './uber-integration.utils';
import type { UberAuthenticationError } from './uber-menu.types';
import type {
  UberMerchantConnectionRecord,
  UberMerchantStore,
  UberStoreMappingRecord,
  UpsertStoreMappingInput,
} from './uber-merchant.types';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import { UberCredentialVaultService } from '../../infrastructure/crypto/uber-credential-vault.service';

import { UberTelemetryService } from './infrastructure/observability/uber-telemetry.service';

@Injectable()
export class UberMerchantGateway {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly telemetry: UberTelemetryService;
  private readonly uberApiBaseUrl: string;
  private readonly oauthStateSecret: string;

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    private readonly httpClient: UberHttpClient,
    @Inject(UberConfigService) private readonly config: UberOAuthStateConfig,
    private readonly prismaAccess: UberPrismaAccessService,
    @Optional()
    private readonly credentialVault = new UberCredentialVaultService(),
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
    this.uberApiBaseUrl = config.apiBaseUrl;
    this.oauthStateSecret = config.getOAuthStateSecret();
  }

  async buildMerchantAuthorizeUrl(
    adminSessionId: string,
    merchantContext?: string,
  ) {
    const state = await this.createOAuthState(adminSessionId, merchantContext);
    const authorizeUrl = this.uberAuthService.buildMerchantAuthorizeUrl(state);

    this.telemetry.workflowLog(
      'log',
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
    merchantContext?: string,
  ) {
    const stateRequest = await this.consumeOAuthState(
      state,
      adminSessionId,
      merchantContext,
    );

    const tokenResult = await this.uberAuthService.exchangeAuthorizationCode(
      code,
      stateRequest.redirectUri,
    );

    this.telemetry.workflowLog(
      'log',
      '[ubereats oauth] tokenExchangeSucceeded=true',
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

    await this.telemetry.captureEvent('ubereats_merchant_oauth_connected', {
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

  async getMerchantStores(merchantUberUserId?: string) {
    const connection = await this.resolveMerchantConnection(merchantUberUserId);
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

    const storeMapping = this.prismaAccess.uberStoreMappingRepository;
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
    await this.telemetry.captureEvent('ubereats_pos_store_mapping_updated', {
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
    const merchantConnection =
      this.prismaAccess.uberMerchantConnectionRepository;
    const connection = merchantUberUserId?.trim()
      ? await merchantConnection?.findUnique({
          where: { merchantUberUserId: merchantUberUserId.trim() },
        })
      : await merchantConnection?.findFirst({
          orderBy: { connectedAt: 'desc' },
        });
    if (!connection) throw new BadRequestException('未找到 Uber 商户授权');

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
    storeId: string,
    payload: Record<string, unknown> = {},
    merchantUberUserId?: string,
  ) {
    if (!storeId.trim()) {
      throw new BadRequestException('storeId 不能为空');
    }
    if (this.containsCredentialField(payload)) {
      throw new BadRequestException('provision payload 不得包含 credential');
    }

    const connection = await this.resolveMerchantConnection(merchantUberUserId);
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

    await this.telemetry.captureEvent('ubereats_store_provision_requested', {
      merchantUberUserId: connection.merchantUberUserId,
      uberStoreId: storeId.trim(),
    });

    return {
      ok: true,
      merchantUberUserId: connection.merchantUberUserId,
      storeId: storeId.trim(),
      isProvisioned: mapping.isProvisioned,
      provisionedAt: mapping.provisionedAt,
      response: this.removeCredentialFields(response),
    };
  }

  revokeOrDeprovisionStore() {
    throw new NotImplementedException('deprovision MVP 暂未实现');
  }

  async syncStoreStatusToUber(target?: {
    uberStoreId: string;
    targetStatus: 'ONLINE' | 'PAUSED';
    reason?: string;
    pauseUntil?: string;
  }) {
    const config = await this.ensureBusinessConfig();
    const mappingDelegate = this.prismaAccess.uberStoreMappingRepository;

    const mappings = await mappingDelegate.findMany({
      orderBy: { uberStoreId: 'asc' },
    });
    const pause = this.parseUberPause(config.temporaryCloseReason);
    const payload: Record<string, string> = target
      ? target.targetStatus === 'PAUSED'
        ? {
            status: 'PAUSED',
            reason: target.reason ?? '运营手动暂停',
            ...(target.pauseUntil ? { pause_until: target.pauseUntil } : {}),
          }
        : { status: 'ONLINE' }
      : config.isTemporarilyClosed
        ? {
            status: 'PAUSED',
            reason: pause.reason,
            ...(pause.pauseUntil ? { pause_until: pause.pauseUntil } : {}),
          }
        : { status: 'ONLINE' };
    const results: Array<Record<string, unknown>> = [];

    for (const mapping of mappings) {
      if (target && mapping.uberStoreId !== target.uberStoreId) continue;
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
          payload,
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
          payload,
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
          : summarizeUberDebugResponse(this.tryParseJson(rawText), rawText);
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
    await this.telemetry.captureEvent('ubereats_store_status_sync_result', {
      ...result,
      payload,
    } as Prisma.JsonObject);
  }

  private async createStoreStatusAlert(
    uberStoreId: string,
    error: string,
    status: number,
    payload: Record<string, string>,
  ) {
    await this.prisma.uberOpsTicket.create({
      data: {
        storeId: uberStoreId,
        type: UberOpsTicketType.STORE_STATUS_SYNC,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: 'Uber 门店状态同步需要运营处理',
        description: redactUberLogText(error).slice(0, 500),
        context: {
          uberStoreId,
          targetStatus: payload.status,
          ...(payload.reason ? { reason: payload.reason } : {}),
          ...(payload.pause_until ? { pauseUntil: payload.pause_until } : {}),
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
    await this.prismaAccess.uberOAuthStateRepository.deleteMany({
      where: { expiresAt: { lte: issuedAt } },
    });
    await this.prismaAccess.uberOAuthStateRepository.create({
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
    merchantContext?: string,
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

    const request = await this.prismaAccess.uberOAuthStateRepository.findUnique(
      {
        where: { nonce },
      },
    );
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

    if (request.redirectUri !== this.uberAuthService.getMerchantRedirectUri()) {
      throw new BadRequestException('OAuth state redirect URI 不匹配');
    }
    if (
      merchantContext !== undefined &&
      request.merchantContext !== (merchantContext.trim() || null)
    ) {
      throw new BadRequestException('OAuth state merchant context 不匹配');
    }

    if (request.expiresAt.getTime() <= now) {
      throw new BadRequestException('OAuth state 已过期');
    }

    // 条件更新是数据库级 compare-and-set；并发回调中只有一个请求能消费成功。
    const consumed =
      await this.prismaAccess.uberOAuthStateRepository.updateMany({
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
  ): Promise<UberMerchantConnectionRecord> {
    if (!merchantUberUserId?.trim()) {
      throw new BadRequestException('merchantUberUserId 不能为空');
    }
    const merchantConnection =
      this.prismaAccess.uberMerchantConnectionRepository;
    const row = await merchantConnection?.findUnique({
      where: { merchantUberUserId: merchantUberUserId.trim() },
    });

    if (!row || (!row.encryptedAccessToken && !row.accessToken)) {
      throw new BadRequestException(
        '未找到 Uber 商户授权，请先调用 /oauth/connect-url 和 /oauth/callback 完成授权',
      );
    }

    // Compatibility window: encrypted value wins; plaintext is read only for
    // rows awaiting backfill. All writes below are ciphertext-only.
    const accessToken = row.encryptedAccessToken
      ? this.credentialVault.decrypt(row.encryptedAccessToken)
      : row.accessToken;
    const refreshToken = row.encryptedRefreshToken
      ? this.credentialVault.decrypt(row.encryptedRefreshToken)
      : row.refreshToken;
    if (!accessToken) throw new BadRequestException('Uber 商户凭据不可用');

    const resolvedRow = { ...row, accessToken, refreshToken };
    const now = Date.now();
    const skewMs = 60_000;
    const isExpired =
      !!row.expiresAt && row.expiresAt.getTime() <= now + skewMs;

    if (!isExpired) {
      return resolvedRow;
    }

    if (!refreshToken) {
      throw new BadRequestException(
        'Uber 商户 access token 已过期，且缺少 refresh token，请重新授权',
      );
    }

    const refreshed = await this.uberAuthService.refreshMerchantAccessToken(
      refreshToken,
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

    await this.telemetry.captureEvent('ubereats_merchant_oauth_refreshed', {
      merchantUberUserId: row.merchantUberUserId,
      scope: refreshed.scope ?? '',
      tokenType: refreshed.tokenType ?? '',
      expiresAt: refreshed.expiresAt?.toISOString() ?? null,
    });

    return updated;
  }

  private async upsertMerchantConnection(
    input: UberMerchantConnectionRecord,
  ): Promise<UberMerchantConnectionRecord> {
    const merchantConnection =
      this.prismaAccess.uberMerchantConnectionRepository;

    const encryptedAccessToken = this.credentialVault.encrypt(
      input.accessToken,
    );
    const encryptedRefreshToken = input.refreshToken
      ? this.credentialVault.encrypt(input.refreshToken)
      : null;
    await merchantConnection.upsert({
      where: { merchantUberUserId: input.merchantUberUserId },
      create: {
        ...input,
        rawStoresSnapshot: input.rawStoresSnapshot
          ? (JSON.parse(
              JSON.stringify(input.rawStoresSnapshot),
            ) as Prisma.InputJsonValue)
          : undefined,
        accessToken: null,
        refreshToken: null,
        encryptedAccessToken,
        encryptedRefreshToken,
      },
      update: {
        accessToken: null,
        refreshToken: null,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
        connectedAt: input.connectedAt,
      } as never,
    });
    return { ...input, encryptedAccessToken, encryptedRefreshToken };
  }

  private async persistMerchantStores(
    merchantUberUserId: string,
    stores: UberMerchantStore[],
    raw: Record<string, unknown>,
  ) {
    const merchantConnection =
      this.prismaAccess.uberMerchantConnectionRepository;
    await merchantConnection.update({
      where: { merchantUberUserId },
      data: { rawStoresSnapshot: this.toJsonValue(raw) },
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
    const storeMapping = this.prismaAccess.uberStoreMappingRepository;

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
        rawPayload: this.toJsonValue(rawPayload),
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
        rawPayload: this.toJsonValue(rawPayload),
      },
    });
  }

  private upsertStoreMapping(
    input: UpsertStoreMappingInput,
  ): Promise<UberStoreMappingRecord> {
    const storeMapping = this.prismaAccess.uberStoreMappingRepository;

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
        rawPayload: this.toJsonValue(input.raw),
      },
      update: {
        merchantUberUserId: input.merchantUberUserId,
        storeName: input.storeName,
        locationSummary: input.locationSummary,
        isProvisioned: input.isProvisioned,
        provisionedAt: input.isProvisioned ? new Date() : undefined,
        posExternalStoreId: input.posExternalStoreId,
        rawPayload: this.toJsonValue(input.raw),
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
        : summarizeUberDebugResponse(parsed, rawText);
      this.telemetry.workflowLog(
        'error',
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

  private removeCredentialFields(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.removeCredentialFields(item));
    }
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/(?:access|refresh)[_-]?token/i.test(key))
        .map(([key, item]) => [key, this.removeCredentialFields(item)]),
    );
  }

  private containsCredentialField(value: unknown): boolean {
    if (Array.isArray(value))
      return value.some((item) => this.containsCredentialField(item));
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) =>
        /(?:access|refresh)[_-]?token/i.test(key) ||
        this.containsCredentialField(item),
    );
  }
}
