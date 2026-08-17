import { createHash } from 'crypto';
import { UberValidationError } from '../shared/uber-application.error';
import type { PublishMenuInput } from '../../domain/menu/uber-menu.types';
import {
  buildUberUploadMenuPayload,
  validateUberMenuPayload,
} from '../../domain/menu/uber-menu-payload.builder';
import { buildUberIdempotencyKey } from '../orders/uber-idempotency-key';
import {
  type UberMenuGatewayPort,
  type UberMenuImageProbePort,
  type UberMenuPublicationRepositoryPort,
  type UberMenuPublishSnapshot,
  type UberMenuSnapshotRepositoryPort,
  type UberPublicBaseUrlPort,
} from './uber-menu-publication.ports';
import type { ProvisionedUberStoreQueryPort } from './uber-menu-draft.ports';
import {
  type UberMenuPriceSource,
  UberMenuPublishSafetyService,
} from '../../domain/menu/uber-menu-publish-safety.service';
import { buildUberNodeId } from '../../domain/menu/uber-menu-graph.service';

export class PublishUberMenuUseCase {
  constructor(
    private readonly provisionedStores: ProvisionedUberStoreQueryPort,
    private readonly snapshots: UberMenuSnapshotRepositoryPort,
    private readonly publications: UberMenuPublicationRepositoryPort,
    private readonly gateway: UberMenuGatewayPort,
    private readonly images: UberMenuImageProbePort,
    private readonly urls: UberPublicBaseUrlPort,
  ) {}

  async execute(input: PublishMenuInput) {
    const requestedStoreId = input.storeId?.trim() || 'default';
    const mapping =
      await this.provisionedStores.resolveProvisionedUberStoreId(
        requestedStoreId,
      );
    if (!mapping)
      throw this.validationError(
        'UBER_STORE_NOT_PROVISIONED',
        `门店 ${requestedStoreId} 未配置 POS 映射或尚未 provision。`,
      );
    const posStoreId = mapping.posExternalStoreId;
    const uberStoreId = mapping.uberStoreId;
    const snapshot = await this.snapshots.loadPublishSnapshot(
      posStoreId,
      uberStoreId,
    );
    if (!snapshot)
      throw this.validationError(
        'UBER_STORE_NOT_PROVISIONED',
        'Uber 门店未配置或尚未 provision。',
      );
    const graph = this.toGraph(snapshot, input);
    const serviceAvailability = this.availability(snapshot.timezone);
    const payload = buildUberUploadMenuPayload(
      graph,
      serviceAvailability,
      snapshot.taxRate,
      { publicBaseUrl: this.urls.publicBaseUrl },
    );
    const validation = validateUberMenuPayload(payload);
    const imageResult = await this.images.validateImages(
      payload.items.flatMap((item) => {
        if (!item.image_url) return [];
        const source = graph.items.find(
          (candidate) => candidate.id === item.id,
        );
        return source
          ? [{ itemStableId: source.sourceStableId, url: item.image_url }]
          : [];
      }),
    );
    if (
      validation.some((issue) => issue.severity === 'ERROR') ||
      !imageResult.valid
    ) {
      throw this.validationError(
        'UBER_MENU_VALIDATION_FAILED',
        `Uber 菜单发布 payload 校验失败，已阻止请求。${imageResult.failures.map((failure) => failure.message).join('；')}`,
      );
    }
    const summary = {
      totalItems: payload.items.length,
      changedItems: payload.items.length,
    };
    const previous =
      await this.publications.findLastSucceededPayload(posStoreId);
    const intentionalRestores =
      await this.publications.listIntentionalPriceRestores(posStoreId);
    const safety = new UberMenuPublishSafetyService().evaluate({
      previous,
      current: payload,
      priceSourcesByUberItemId: new Map<string, UberMenuPriceSource>([
        ...snapshot.items.map(
          (item) =>
            [
              buildUberNodeId('item', snapshot.storeId, item.stableId),
              {
                stableId: item.stableId,
                entityType: 'ITEM' as const,
                field: 'price' as const,
                sourcePriceCents: item.sourcePriceCents,
                overridePriceCents: item.overridePriceCents,
                valueSource: item.priceValueSource,
              },
            ] as const,
        ),
        ...snapshot.modifierOptions.map(
          (option) =>
            [
              buildUberNodeId('item', snapshot.storeId, option.stableId),
              {
                stableId: option.stableId,
                entityType: 'OPTION_ITEM' as const,
                field: 'priceDelta' as const,
                sourcePriceCents: option.sourcePriceDeltaCents,
                overridePriceCents: option.overridePriceDeltaCents,
                valueSource: option.priceValueSource,
              },
            ] as const,
        ),
      ]),
      intentionalRestoreItemIds: intentionalRestores,
    });
    if (input.dryRun)
      return {
        ok: true,
        dryRun: true,
        storeId: posStoreId,
        uberStoreId: snapshot.uberStoreId,
        summary,
        serviceAvailability,
        serviceAvailabilityTimezone: snapshot.timezone,
        taxRate: {
          percentage: snapshot.taxRate,
          source: 'BusinessConfig.salesTaxRate',
          requiresAdminConfirmation: true,
          confirmed: false,
        },
        safety,
      };
    if (input.taxRateConfirmed !== true)
      throw this.validationError(
        'UBER_TAX_RATE_NOT_CONFIRMED',
        `正式发布前必须由管理员确认税率 ${snapshot.taxRate}%。`,
      );

    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    if (
      safety.criticalCount > 0 &&
      input.safetyFingerprint !== safety.fingerprint
    )
      throw this.validationError(
        'UBER_MENU_CRITICAL_RISK_CONFIRMATION_REQUIRED',
        `检测到 ${safety.criticalCount} 项高风险菜单变化，普通发布已阻断。请在 MFA 会话中查看 Dry Run 安全摘要并显式确认。`,
      );
    if (safety.criticalCount > 0)
      await this.publications.recordCriticalRiskAcknowledgement({
        storeId: posStoreId,
        payloadHash,
        criticalCount: safety.criticalCount,
      });
    const idempotencyKey = buildUberIdempotencyKey({
      taskId: payloadHash,
      resourceId: `${posStoreId}:${snapshot.uberStoreId}`,
      action: 'PUBLISH_MENU',
      businessVersion: payloadHash,
    });
    const succeeded =
      await this.publications.findSucceededAttempt(idempotencyKey);
    if (succeeded)
      return {
        ok: true,
        dryRun: false,
        duplicate: true,
        storeId: posStoreId,
        uberStoreId: snapshot.uberStoreId,
        versionStableId: succeeded.businessVersion,
        summary,
      };
    const attempt = await this.publications.createAttempt({
      storeId: posStoreId,
      uberStoreId: snapshot.uberStoreId,
      idempotencyKey,
      businessVersion: payloadHash,
      payloadHash,
      payload,
      totalItems: payload.items.length,
    });
    try {
      await this.gateway.uploadMenu({
        storeId: snapshot.uberStoreId,
        payload,
        idempotencyKey,
      });
      await this.publications.markPublishVersionSucceeded(attempt.attemptId, {
        status_code: 204,
      });
      return {
        ok: true,
        dryRun: false,
        storeId: posStoreId,
        uberStoreId: snapshot.uberStoreId,
        versionStableId: attempt.businessVersion,
        summary,
      };
    } catch (error) {
      const retryable = this.isRetryable(error);
      await this.publications.markFailed(attempt.attemptId, {
        errorCode: retryable ? 'UBER_UPLOAD_RETRYABLE' : 'UBER_UPLOAD_REJECTED',
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable,
      });
      throw error;
    }
  }

  private toGraph(snapshot: UberMenuPublishSnapshot, input: PublishMenuInput) {
    const excludedCategories = new Set(input.excludedCategoryIds ?? []);
    const excludedGroups = new Set(input.excludedGroupIds ?? []);
    const excludedItems = new Set(input.excludedMenuItemStableIds ?? []);
    const excludedOptions = new Set(input.excludedOptionChoiceStableIds ?? []);
    const itemNodeId = (stableId: string) =>
      buildUberNodeId('item', snapshot.storeId, stableId);
    const groupNodeId = (stableId: string) =>
      buildUberNodeId('group', snapshot.storeId, stableId);
    const includedItems = snapshot.items.filter(
      (item) =>
        !excludedItems.has(item.stableId) &&
        !excludedCategories.has(item.categoryStableId),
    );
    const includedOptions = snapshot.modifierOptions.filter(
      (option) => !excludedOptions.has(option.stableId),
    );
    return {
      menuId: buildUberNodeId('menu', snapshot.storeId, snapshot.uberStoreId),
      categories: snapshot.categories
        .filter((category) => !excludedCategories.has(category.stableId))
        .map((category) => ({
          id: buildUberNodeId('category', snapshot.storeId, category.stableId),
          title: category.name,
          entities: category.itemStableIds
            .filter((stableId) =>
              includedItems.some((item) => item.stableId === stableId),
            )
            .map(itemNodeId),
        }))
        .filter((category) => category.entities.length),
      items: [
        ...includedItems.map((item) => ({
          id: itemNodeId(item.stableId),
          sourceType: 'MENU_ITEM' as const,
          sourceStableId: item.stableId,
          title: item.name,
          description: item.description,
          priceCents: item.priceCents,
          isAvailable: item.isAvailable,
          modifierGroupIds: item.modifierGroupStableIds
            .filter((stableId) => !excludedGroups.has(stableId))
            .map(groupNodeId),
          imageUrl: item.imageUrl,
        })),
        ...includedOptions.map((option) => ({
          id: itemNodeId(option.stableId),
          sourceType: 'OPTION_ITEM' as const,
          sourceStableId: option.stableId,
          title: option.name,
          description: null,
          priceCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
          modifierGroupIds: [],
          imageUrl: null,
        })),
      ],
      groups: snapshot.modifierGroups
        .filter((group) => !excludedGroups.has(group.stableId))
        .map((group) => ({
          id: groupNodeId(group.stableId),
          title: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          optionItemIds: group.optionStableIds
            .filter((stableId) =>
              includedOptions.some((option) => option.stableId === stableId),
            )
            .map(itemNodeId),
        }))
        .filter((group) => group.optionItemIds.length),
    };
  }

  private availability(timezone: string) {
    void timezone;
    return [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ].map((day_of_week) => ({
      day_of_week,
      time_periods: [{ start_time: '00:00', end_time: '23:59' }],
    }));
  }

  private validationError(code: string, message: string) {
    return new UberValidationError({
      code,
      message,
      operation: 'uber.menu.publish',
    });
  }

  private isRetryable(error: unknown) {
    const status =
      (error as { status?: number; response?: { status?: number } })?.status ??
      (error as { response?: { status?: number } })?.response?.status;
    return (
      status === undefined || status === 408 || status === 429 || status >= 500
    );
  }
}
