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
    const posStoreId = input.storeId?.trim() || 'default';
    const mapping =
      await this.provisionedStores.resolveProvisionedUberStoreId(posStoreId);
    if (!mapping)
      throw this.validationError(
        'UBER_STORE_NOT_PROVISIONED',
        `POS 门店 ${posStoreId} 未配置或尚未 provision。`,
      );
    const storeId = mapping.uberStoreId;
    const snapshot = await this.snapshots.loadPublishSnapshot(
      posStoreId,
      storeId,
    );
    if (!snapshot)
      throw this.validationError(
        'UBER_STORE_NOT_PROVISIONED',
        'Uber 门店未配置或尚未 provision。',
      );
    const graph = this.toGraph(snapshot, input);
    const payload = buildUberUploadMenuPayload(
      graph,
      this.availability(snapshot.timezone),
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
        storeId,
        uberStoreId: snapshot.uberStoreId,
        summary,
        payload,
        validation,
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
      resourceId: `${storeId}:${snapshot.uberStoreId}`,
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
        storeId,
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
      const uploaded = await this.gateway.uploadMenu({
        storeId: snapshot.uberStoreId,
        payload,
        idempotencyKey,
      });
      await this.publications.markSubmitted(attempt.attemptId, uploaded);
      return {
        ok: true,
        dryRun: false,
        storeId,
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
    const itemId = (id: string) =>
      buildUberNodeId('item', snapshot.storeId, id);
    const groupId = (id: string) =>
      buildUberNodeId('group', snapshot.storeId, id);
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
        .filter((c) => !excludedCategories.has(c.stableId))
        .map((c) => ({
          id: buildUberNodeId('category', snapshot.storeId, c.stableId),
          title: c.name,
          entities: c.itemStableIds
            .filter((id) => includedItems.some((item) => item.stableId === id))
            .map(itemId),
        }))
        .filter((c) => c.entities.length),
      items: [
        ...includedItems.map((item) => ({
          id: itemId(item.stableId),
          sourceType: 'MENU_ITEM' as const,
          sourceStableId: item.stableId,
          title: item.name,
          description: item.description,
          priceCents: item.priceCents,
          isAvailable: item.isAvailable,
          modifierGroupIds: item.modifierGroupStableIds
            .filter((id) => !excludedGroups.has(id))
            .map(groupId),
          imageUrl: item.imageUrl,
        })),
        ...includedOptions.map((option) => ({
          id: itemId(option.stableId),
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
        .filter((g) => !excludedGroups.has(g.stableId))
        .map((g) => ({
          id: groupId(g.stableId),
          title: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          optionItemIds: g.optionStableIds
            .filter((id) =>
              includedOptions.some((option) => option.stableId === id),
            )
            .map(itemId),
        }))
        .filter((g) => g.optionItemIds.length),
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
