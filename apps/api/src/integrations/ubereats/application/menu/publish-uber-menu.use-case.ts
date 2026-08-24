import { createHash } from 'crypto';
import {
  isUberApplicationError,
  UberValidationError,
} from '../shared/uber-application.error';
import type {
  PublishMenuInput,
  UberMenuUploadPayload,
} from '../../domain/menu/uber-menu.types';
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
  type UberRetrievedMenu,
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
    const unclassifiedItems = graph.items.filter(
      (item) => item.preparationType === null,
    );
    if (unclassifiedItems.length) {
      throw this.validationError(
        'UBER_PREPARATION_TYPE_REQUIRED',
        `发布 Uber 菜单前必须明确标记每个商品为 PREPARED 或 PREPACKAGED。未确认：${unclassifiedItems
          .slice(0, 5)
          .map((item) => item.sourceStableId)
          .join(
            ', ',
          )}${unclassifiedItems.length > 5 ? ` 等 ${unclassifiedItems.length} 项` : ''}`,
      );
    }
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
    const payloadItemIds = new Set(payload.items.map((item) => item.id));
    const attempt = await this.publications.createAttempt({
      storeId: posStoreId,
      uberStoreId: snapshot.uberStoreId,
      idempotencyKey,
      businessVersion: payloadHash,
      payloadHash,
      payload,
      totalItems: payload.items.length,
      publishedItems: graph.items
        .filter((item) => payloadItemIds.has(item.id))
        .map((item) => ({
          uberItemId: item.id,
          menuItemStableId: item.sourceStableId,
          publishedPriceCents: item.priceCents,
          publishedIsAvailable: item.isAvailable,
          publishedName: item.title,
        })),
    });
    if (attempt.status === 'SUCCEEDED')
      return {
        ok: true,
        dryRun: false,
        duplicate: true,
        storeId: posStoreId,
        uberStoreId: snapshot.uberStoreId,
        versionStableId: attempt.businessVersion,
        summary,
      };
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
      const applicationError = isUberApplicationError(error) ? error : null;
      const retryable = this.isRetryable(error);
      await this.publications.markFailed(attempt.attemptId, {
        errorCode:
          applicationError?.code ??
          (retryable ? 'UBER_UPLOAD_RETRYABLE' : 'UBER_UPLOAD_REJECTED'),
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable,
        upstreamStatus:
          applicationError?.upstreamStatus ?? this.upstreamStatus(error),
        upstreamDetail: applicationError?.upstreamDetail ?? null,
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
    const referencedGroupStableIds = new Set(
      includedItems.flatMap((item) => item.modifierGroupStableIds),
    );
    const includedGroups = snapshot.modifierGroups.filter(
      (group) =>
        referencedGroupStableIds.has(group.stableId) &&
        !excludedGroups.has(group.stableId),
    );
    const referencedOptionStableIds = new Set(
      includedGroups.flatMap((group) => group.optionStableIds),
    );
    const includedOptions = snapshot.modifierOptions.filter(
      (option) =>
        referencedOptionStableIds.has(option.stableId) &&
        !excludedOptions.has(option.stableId),
    );
    const includedOptionStableIds = new Set(
      includedOptions.map((option) => option.stableId),
    );
    const emittedGroups = includedGroups.filter((group) =>
      group.optionStableIds.some((stableId) =>
        includedOptionStableIds.has(stableId),
      ),
    );
    const emittedGroupStableIds = new Set(
      emittedGroups.map((group) => group.stableId),
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
          suspendUntilEpochSeconds: item.suspendUntilEpochSeconds,
          preparationType: item.preparationType,
          modifierGroupIds: item.modifierGroupStableIds
            .filter((stableId) => emittedGroupStableIds.has(stableId))
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
          suspendUntilEpochSeconds: option.suspendUntilEpochSeconds,
          preparationType: option.preparationType,
          modifierGroupIds: [],
          imageUrl: null,
        })),
      ],
      groups: emittedGroups.map((group) => ({
        id: groupNodeId(group.stableId),
        title: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        optionItemIds: group.optionStableIds
          .filter((stableId) => includedOptionStableIds.has(stableId))
          .map(itemNodeId),
      })),
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
    if (isUberApplicationError(error)) return error.retryable;
    const status = this.upstreamStatus(error);
    return status === null || status === 408 || status === 429 || status >= 500;
  }

  private upstreamStatus(error: unknown): number | null {
    const status =
      (error as { status?: number; response?: { status?: number } })?.status ??
      (error as { response?: { status?: number } })?.response?.status;
    return typeof status === 'number' ? status : null;
  }
}

export type UberMenuReconciliationMismatch = {
  resourceType: 'ITEM' | 'MODIFIER_GROUP';
  resourceId: string;
  field:
    | 'priceCents'
    | 'isAvailable'
    | 'modifierGroupIds'
    | 'taxRatePercentage'
    | 'preparationType'
    | 'optionItemIds';
  expected: string;
  actual: string;
};

const sortedIds = (values: readonly string[]) => [...values].sort();
const equalIds = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify(sortedIds(left)) === JSON.stringify(sortedIds(right));
const renderReconciliationValue = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));

const expectedPublishedAvailability = (
  item: UberMenuUploadPayload['items'][number],
  nowEpochSeconds: number,
) => {
  const suspendUntil = item.suspension_info?.suspension?.suspend_until;
  return !(
    typeof suspendUntil === 'number' &&
    Number.isFinite(suspendUntil) &&
    suspendUntil > nowEpochSeconds
  );
};

/** Reads the live Uber Menu V2 representation and compares it with the last successful full publish. */
export class RetrieveAndReconcileUberMenuUseCase {
  constructor(
    private readonly provisionedStores: ProvisionedUberStoreQueryPort,
    private readonly publications: UberMenuPublicationRepositoryPort,
    private readonly gateway: UberMenuGatewayPort,
  ) {}

  async execute(storeId?: string) {
    const requestedStoreId = storeId?.trim() || 'default';
    const mapping =
      await this.provisionedStores.resolveProvisionedUberStoreId(
        requestedStoreId,
      );
    if (!mapping)
      throw new UberValidationError({
        code: 'UBER_STORE_NOT_PROVISIONED',
        operation: 'uber.menu.retrieve',
        message: `门店 ${requestedStoreId} 未配置 POS 映射或尚未 provision。`,
      });

    const [retrieved, baseline] = await Promise.all([
      this.gateway.retrieveMenu(mapping.uberStoreId),
      this.publications.findLastSucceededPayload(mapping.posExternalStoreId),
    ]);
    return this.reconcile(
      mapping.posExternalStoreId,
      mapping.uberStoreId,
      retrieved,
      baseline,
    );
  }

  private reconcile(
    storeId: string,
    uberStoreId: string,
    retrieved: UberRetrievedMenu,
    baseline: UberMenuUploadPayload | null,
  ) {
    const baselineDisableItemInstructions = baseline
      ? (baseline.display_options?.disable_item_instructions ?? null)
      : null;
    const expectedDisableItemInstructions = false;
    const specialInstructionFlagVerified =
      retrieved.disableItemInstructions !== null &&
      retrieved.disableItemInstructions === expectedDisableItemInstructions;
    const remoteSummary = {
      menuCount: retrieved.menuIds.length,
      categoryCount: retrieved.categoryIds.length,
      itemCount: retrieved.items.length,
      modifierGroupCount: retrieved.modifierGroups.length,
      taxLabelItemCount: retrieved.items.filter(
        (item) => item.taxLabels.length > 0,
      ).length,
      preparationTypeItemCount: retrieved.items.filter(
        (item) => item.preparationType !== null,
      ).length,
    };

    if (!baseline)
      return {
        storeId,
        uberStoreId,
        retrieved: remoteSummary,
        baseline: null,
        reconciliation: {
          matchesLastSuccessfulPublish: null,
          missingMenuIds: [] as string[],
          extraMenuIds: [] as string[],
          missingCategoryIds: [] as string[],
          extraCategoryIds: [] as string[],
          missingItemIds: [] as string[],
          extraItemIds: [] as string[],
          missingModifierGroupIds: [] as string[],
          extraModifierGroupIds: [] as string[],
          mismatches: [] as UberMenuReconciliationMismatch[],
        },
        specialInstructions: {
          expectedDisableItemInstructions,
          remoteDisableItemInstructions: retrieved.disableItemInstructions,
          verified: specialInstructionFlagVerified,
        },
      };

    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const expectedMenuIds = baseline.menus.map((menu) => menu.id);
    const expectedCategoryIds = baseline.categories.map(
      (category) => category.id,
    );
    const missingMenuIds = expectedMenuIds.filter(
      (id) => !retrieved.menuIds.includes(id),
    );
    const extraMenuIds = retrieved.menuIds.filter(
      (id) => !expectedMenuIds.includes(id),
    );
    const missingCategoryIds = expectedCategoryIds.filter(
      (id) => !retrieved.categoryIds.includes(id),
    );
    const extraCategoryIds = retrieved.categoryIds.filter(
      (id) => !expectedCategoryIds.includes(id),
    );
    const expectedItems = new Map(
      baseline.items.map((item) => [item.id, item]),
    );
    const remoteItems = new Map(retrieved.items.map((item) => [item.id, item]));
    const expectedGroups = new Map(
      baseline.modifier_groups.map((group) => [group.id, group]),
    );
    const remoteGroups = new Map(
      retrieved.modifierGroups.map((group) => [group.id, group]),
    );
    const missingItemIds = [...expectedItems.keys()].filter(
      (id) => !remoteItems.has(id),
    );
    const extraItemIds = [...remoteItems.keys()].filter(
      (id) => !expectedItems.has(id),
    );
    const missingModifierGroupIds = [...expectedGroups.keys()].filter(
      (id) => !remoteGroups.has(id),
    );
    const extraModifierGroupIds = [...remoteGroups.keys()].filter(
      (id) => !expectedGroups.has(id),
    );
    const mismatches: UberMenuReconciliationMismatch[] = [];

    for (const [id, expected] of expectedItems) {
      const actual = remoteItems.get(id);
      if (!actual) continue;
      const expectedModifierGroupIds = expected.modifier_group_ids.ids ?? [];
      const expectedIsAvailable = expectedPublishedAvailability(
        expected,
        nowEpochSeconds,
      );
      if (expected.price_info.price !== actual.priceCents)
        mismatches.push({
          resourceType: 'ITEM',
          resourceId: id,
          field: 'priceCents',
          expected: renderReconciliationValue(expected.price_info.price),
          actual: renderReconciliationValue(actual.priceCents),
        });
      if (expectedIsAvailable !== actual.isAvailable)
        mismatches.push({
          resourceType: 'ITEM',
          resourceId: id,
          field: 'isAvailable',
          expected: renderReconciliationValue(expectedIsAvailable),
          actual: renderReconciliationValue(actual.isAvailable),
        });
      if (!equalIds(expectedModifierGroupIds, actual.modifierGroupIds))
        mismatches.push({
          resourceType: 'ITEM',
          resourceId: id,
          field: 'modifierGroupIds',
          expected: renderReconciliationValue(
            sortedIds(expectedModifierGroupIds),
          ),
          actual: renderReconciliationValue(sortedIds(actual.modifierGroupIds)),
        });
      if (
        actual.taxRatePercentage !== null &&
        expected.tax_info.tax_rate !== actual.taxRatePercentage
      )
        mismatches.push({
          resourceType: 'ITEM',
          resourceId: id,
          field: 'taxRatePercentage',
          expected: renderReconciliationValue(expected.tax_info.tax_rate),
          actual: renderReconciliationValue(actual.taxRatePercentage),
        });
      const expectedPreparationType =
        expected.dish_info?.classifications?.preparation_type;
      if (
        expectedPreparationType !== undefined &&
        expectedPreparationType !== actual.preparationType
      )
        mismatches.push({
          resourceType: 'ITEM',
          resourceId: id,
          field: 'preparationType',
          expected: renderReconciliationValue(expectedPreparationType),
          actual: renderReconciliationValue(actual.preparationType),
        });
    }

    for (const [id, expected] of expectedGroups) {
      const actual = remoteGroups.get(id);
      if (!actual) continue;
      const expectedOptionIds = expected.modifier_options.map(
        (option) => option.id,
      );
      if (!equalIds(expectedOptionIds, actual.optionItemIds))
        mismatches.push({
          resourceType: 'MODIFIER_GROUP',
          resourceId: id,
          field: 'optionItemIds',
          expected: renderReconciliationValue(sortedIds(expectedOptionIds)),
          actual: renderReconciliationValue(sortedIds(actual.optionItemIds)),
        });
    }

    const explicitInstructionMismatch =
      retrieved.disableItemInstructions !== null &&
      retrieved.disableItemInstructions !== expectedDisableItemInstructions;
    const matchesLastSuccessfulPublish =
      missingMenuIds.length === 0 &&
      extraMenuIds.length === 0 &&
      missingCategoryIds.length === 0 &&
      extraCategoryIds.length === 0 &&
      missingItemIds.length === 0 &&
      extraItemIds.length === 0 &&
      missingModifierGroupIds.length === 0 &&
      extraModifierGroupIds.length === 0 &&
      mismatches.length === 0 &&
      !explicitInstructionMismatch;

    return {
      storeId,
      uberStoreId,
      retrieved: remoteSummary,
      baseline: {
        itemCount: baseline.items.length,
        modifierGroupCount: baseline.modifier_groups.length,
        expectedDisableItemInstructions: baselineDisableItemInstructions,
      },
      reconciliation: {
        matchesLastSuccessfulPublish,
        missingMenuIds: sortedIds(missingMenuIds),
        extraMenuIds: sortedIds(extraMenuIds),
        missingCategoryIds: sortedIds(missingCategoryIds),
        extraCategoryIds: sortedIds(extraCategoryIds),
        missingItemIds: sortedIds(missingItemIds),
        extraItemIds: sortedIds(extraItemIds),
        missingModifierGroupIds: sortedIds(missingModifierGroupIds),
        extraModifierGroupIds: sortedIds(extraModifierGroupIds),
        mismatches,
      },
      specialInstructions: {
        expectedDisableItemInstructions,
        remoteDisableItemInstructions: retrieved.disableItemInstructions,
        verified: specialInstructionFlagVerified,
      },
    };
  }
}
