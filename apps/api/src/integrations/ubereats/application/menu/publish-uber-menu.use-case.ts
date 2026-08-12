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
} from './uber-menu-publication.ports';

export class PublishUberMenuUseCase {
  constructor(
    private readonly snapshots: UberMenuSnapshotRepositoryPort,
    private readonly publications: UberMenuPublicationRepositoryPort,
    private readonly gateway: UberMenuGatewayPort,
    private readonly images: UberMenuImageProbePort,
  ) {}

  async execute(input: PublishMenuInput) {
    const storeId = input.storeId?.trim() || 'default';
    const snapshot = await this.snapshots.loadPublishSnapshot(storeId);
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
    );
    const validation = validateUberMenuPayload(payload);
    const imageResult = await this.images.validateImages(
      graph.items
        .filter((item) => item.imageUrl)
        .map((item) => ({
          itemStableId: item.sourceStableId,
          url: item.imageUrl!,
        })),
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
    if (input.dryRun)
      return {
        ok: true,
        dryRun: true,
        storeId,
        uberStoreId: snapshot.uberStoreId,
        summary,
        payload,
        validation,
      };
    if (input.taxRateConfirmed !== true)
      throw this.validationError(
        'UBER_TAX_RATE_NOT_CONFIRMED',
        `正式发布前必须由管理员确认税率 ${snapshot.taxRate}%。`,
      );

    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
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
      storeId,
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
    const itemId = (id: string) => `sanq:item:${id}`;
    const groupId = (id: string) => `sanq:group:${id}`;
    const includedItems = snapshot.items.filter(
      (item) =>
        !excludedItems.has(item.stableId) &&
        !excludedCategories.has(item.categoryStableId),
    );
    const includedOptions = snapshot.modifierOptions.filter(
      (option) => !excludedOptions.has(option.stableId),
    );
    return {
      menuId: `sanq:menu:${snapshot.storeId}`,
      categories: snapshot.categories
        .filter((c) => !excludedCategories.has(c.stableId))
        .map((c) => ({
          id: `sanq:category:${c.stableId}`,
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
