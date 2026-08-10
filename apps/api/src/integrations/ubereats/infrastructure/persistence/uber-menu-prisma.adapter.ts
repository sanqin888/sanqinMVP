import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  UberMenuPublishStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { buildUberIdempotencyKey } from '../../application/idempotency/uber-idempotency-key';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { UberMenuNotificationEventV1 } from '../../contracts/events/uber-menu-notification.v1';
import { UberAuthService } from '../../infrastructure/uber-api/uber-token.provider';
import {
  UberConfigService,
  type UberMenuConfig,
} from '../../infrastructure/config/uber-config.service';
import { UberMenuGateway } from '../../infrastructure/uber-api/uber-resource.gateways';
import { UberHttpClient } from '../../infrastructure/uber-api/uber-http.client';
import {
  normalizeUberStoreId,
  redactUberLogText,
} from '../../domain/shared/uber-integration.utils';
import type {
  PublishMenuInput,
  SyncAvailabilityInput,
  SyncOptionAvailabilityInput,
  UberAvailabilitySyncResult,
  UberAvailabilitySyncStatus,
  UberMenuPublishError,
  UberMenuUploadPayload,
  UpdateDraftGroupInput,
  UpdateDraftItemInput,
  UpdateDraftOptionInput,
  UpsertOptionItemConfigInput,
  UpsertPriceBookItemInput,
} from '../../domain/menu/uber-menu.types';
import type { UberMerchantConnectionRecord } from '../../domain/merchant/uber-merchant.types';
import type { ParsedUberOrderItem } from '../../domain/orders/uber-order.types';
import { toUberServiceAvailability } from '../../domain/menu/uber-payload.utils';
import type { UberServiceAvailability } from '../../domain/menu/uber-payload.utils';
import { UberPrismaAccessService } from '../../infrastructure/persistence/uber-prisma-access.service';
import { UberCredentialVaultService } from '../../infrastructure/crypto/uber-credential-vault.service';
import {
  composeUberDisplayName,
  buildUberUploadMenuPayload,
  validateUberMenuPayload,
} from '../../domain/menu/uber-menu-payload.builder';
import {
  flattenNestedModifiersForUber,
  validateUberMenuGraph,
  summarizeUberMenuGraph,
} from '../../domain/menu/uber-menu-graph.service';
import { UberImageValidator } from '../../infrastructure/uber-api/uber-image.validator';

import { UberTelemetryService } from '../../infrastructure/observability/uber-telemetry.service';

@Injectable()
export class UberMenuPrismaAdapter {
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly telemetry: UberTelemetryService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    private readonly menuGateway: UberMenuGateway,
    @Inject(UberConfigService) private readonly config: UberMenuConfig,
    private readonly prismaAccess: UberPrismaAccessService,
    private readonly httpClient: UberHttpClient,
    @Optional()
    private readonly credentialVault = new UberCredentialVaultService(),
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
  }

  validateUberMenuPayload(payload: UberMenuUploadPayload) {
    return validateUberMenuPayload(payload);
  }

  /** Startup/periodic recovery for uploads whose confirmation loop was interrupted. */
  async recoverTimedOutPublications(timeoutMs = 30 * 60_000): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMs);
    const result = await this.prismaAccess.uberMenuPublishRepository.updateMany(
      {
        where: {
          status: UberMenuPublishStatus.SUBMITTED,
          startedAt: { lt: cutoff },
        },
        data: {
          status: UberMenuPublishStatus.FAILED,
          finishedAt: new Date(),
          errorMessage: '菜单发布确认超时；需要人工检查 Uber 后台状态后重试',
          errorDetails: { code: 'CONFIRMATION_TIMEOUT', retryable: true },
        },
      },
    );
    if (result.count > 0) {
      this.telemetry.workflowLog(
        'error',
        `[ubereats menu recovery] timedOutSubmitted=${result.count}`,
      );
    }
    return result.count;
  }

  async listUberItemChannelConfigs(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
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

  async listUberPublishedMenuItems(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const items = await this.prisma.uberPublishedMenuItem.findMany({
      where: {
        storeId: normalizedStoreId,
        publishVersion: {
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
      select: {
        publishVersionId: true,
        uberStoreId: true,
        uberItemId: true,
        menuItemStableId: true,
        publishedPriceCents: true,
        publishedIsAvailable: true,
        publishedName: true,
        publishedAt: true,
        publishVersion: { select: { versionStableId: true, status: true } },
      },
    });

    return { storeId: normalizedStoreId, count: items.length, items };
  }

  async listUberOptionItemConfigs(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
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
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
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

    await this.telemetry.captureEvent('ubereats_price_book_item_upserted', {
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
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
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

    await this.telemetry.captureEvent('ubereats_option_item_config_upserted', {
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
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const storeMapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        uberStoreId: normalizedStoreId,
        isProvisioned: true,
      },
      select: { uberStoreId: true },
    });
    const uberStoreId =
      storeMapping?.uberStoreId ?? `draft:${normalizedStoreId}`;
    const graph = await this.buildUberMenuGraph(normalizedStoreId, uberStoreId);
    const normalized = this.normalizeAndValidateUberMenuGraph(graph);
    const schedule = await this.getUberMenuSchedule();
    const payload = buildUberUploadMenuPayload(
      normalized.graph,
      schedule.serviceAvailability,
      schedule.taxRatePercentage,
    );
    const payloadValidation = validateUberMenuPayload(payload);
    const summary = this.summarizePublishGraph(normalized.graph);
    const lastPublishedVersion =
      await this.prismaAccess.uberMenuPublishRepository.findFirst({
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
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
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
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
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
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
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
    const normalizedStoreId = normalizeUberStoreId(storeId);
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

    await this.telemetry.captureEvent(
      'ubereats_draft_option_child_group_bound',
      {
        storeId: normalizedStoreId,
        optionItemId,
        groupId,
        mode: 'uber_binding_only',
      },
    );

    return { ok: true, storeId: normalizedStoreId, optionItemId, groupId };
  }

  async unbindUberDraftOptionChildGroup(
    optionItemId: string,
    groupId: string,
    storeId?: string,
  ) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
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

    await this.telemetry.captureEvent(
      'ubereats_draft_option_child_group_unbound',
      {
        storeId: normalizedStoreId,
        optionItemId,
        groupId,
        isBound: row.isBound,
      },
    );

    return {
      ok: true,
      storeId: normalizedStoreId,
      optionItemId,
      groupId,
      deletedCount: 1,
    };
  }

  async getUberMenuDraftDiff(storeId?: string) {
    const normalizedStoreId = normalizeUberStoreId(storeId);
    const draft = await this.getUberMenuDraft(normalizedStoreId);
    const lastSuccess =
      await this.prismaAccess.uberMenuPublishRepository.findFirst({
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
    const normalizedStoreId = normalizeUberStoreId(input.storeId);
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
    const payload = buildUberUploadMenuPayload(
      normalized.graph,
      schedule.serviceAvailability,
      schedule.taxRatePercentage,
    );
    const imageValidation = await this.validateUberMenuImages(payload);
    const payloadValidation = [
      ...validateUberMenuPayload(payload),
      ...imageValidation.issues,
    ];
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
      await this.telemetry.captureEvent('ubereats_menu_publish_dry_run', {
        storeId: normalizedStoreId,
        uberStoreId,
        summary: summary as unknown as Prisma.JsonValue,
      });
      return {
        ok: true,
        dryRun: true,
        storeId: normalizedStoreId,
        uberStoreId,
        summary,
        serviceAvailability: schedule.serviceAvailability,
        serviceAvailabilityTimezone: schedule.timezone,
        taxRate: {
          percentage: schedule.taxRatePercentage,
          source: schedule.taxRateSource,
          requiresAdminConfirmation: true,
          confirmed: input.taxRateConfirmed === true,
        },
        imageValidation: imageValidation.results,
        modifierFlattening: this.buildModifierFlatteningReport(
          normalized.graph,
          graph.optionMappings,
        ),
        payload,
        mappingErrors: graph.mappingErrors,
        validation: {
          warnings: normalized.warnings,
          errors: validationErrors,
        },
      };
    }

    if (input.taxRateConfirmed !== true) {
      throw new BadRequestException(
        `正式发布前必须由管理员确认税率 ${schedule.taxRatePercentage}%（来源：${schedule.taxRateSource}）。`,
      );
    }

    await this.assertUberStoreTimezone(
      uberStoreId,
      schedule.timezone,
      input.timezoneConfirmed === true,
    );

    const version = await this.createMenuPublishVersionStarted(
      normalizedStoreId,
      uberStoreId,
      summary,
      payload,
      normalized.graph,
    );

    try {
      const response = await this.uploadUberMenu(
        uberStoreId,
        payload,
        version.idempotencyKey ??
          buildUberIdempotencyKey({
            taskId: version.id,
            resourceId: `${normalizedStoreId}:${uberStoreId}`,
            action: 'PUBLISH_MENU',
            businessVersion: createHash('sha256')
              .update(JSON.stringify(payload))
              .digest('hex'),
          }),
      );
      await this.markMenuPublishVersionSubmitted(version.id, response);

      const finalStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED' = 'SUBMITTED';
      if (!this.hasMenuNotificationCapability()) {
        void this.pollUploadedMenuUntilTerminal(
          version.id,
          normalizedStoreId,
          uberStoreId,
          payload,
        ).catch((error) =>
          this.telemetry.workflowLog(
            'error',
            `[ubereats menu] confirmation task failed versionId=${version.id}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }

      await this.telemetry.captureEvent('ubereats_menu_published', {
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

  async syncUberMenuItemAvailability(
    input: SyncAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult> {
    await this.ensureMenuItemExists(input.menuItemStableId);
    const requestedStoreId = input.storeId?.trim();
    const configs = await this.prisma.uberItemChannelConfig.findMany({
      where: {
        menuItemStableId: input.menuItemStableId,
        ...(requestedStoreId ? { storeId: requestedStoreId } : {}),
      },
    });
    if (configs.length === 0) {
      return { status: 'SKIPPED_NOT_PUBLISHED', stores: [] };
    }

    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: { isProvisioned: true },
      select: { uberStoreId: true },
    });
    const stores: UberAvailabilitySyncResult['stores'] = [];
    for (const config of configs) {
      const mapping = mappings.find(
        (candidate) =>
          candidate.uberStoreId === config.storeId ||
          candidate.uberStoreId === config.uberStoreId,
      );
      if (!mapping || !config.externalItemId) {
        stores.push({
          storeId: config.storeId,
          uberStoreId: mapping?.uberStoreId ?? config.uberStoreId ?? null,
          status: 'SKIPPED_NOT_PUBLISHED',
        });
        continue;
      }

      await this.prisma.uberItemChannelConfig.update({
        where: {
          storeId_menuItemStableId: {
            storeId: config.storeId,
            menuItemStableId: input.menuItemStableId,
          },
        },
        data: { isAvailable: input.isAvailable },
      });
      try {
        // This integration currently supports Uber's asynchronous full-menu upload.
        // Every upload creates a durable publish version and is completed by the
        // notification handler or the polling confirmation task.
        const published = await this.publishUberMenu({
          storeId: config.storeId,
          dryRun: false,
          taxRateConfirmed: true,
          timezoneConfirmed: true,
        });
        stores.push({
          storeId: config.storeId,
          uberStoreId: mapping.uberStoreId,
          status: 'PENDING',
          versionStableId: published.versionStableId,
        });
      } catch (error) {
        const message = this.summarizeWebhookError(error);
        await this.prismaAccess.uberOpsTicketRepository.create({
          data: {
            storeId: config.storeId,
            type: UberOpsTicketType.MENU_PUBLISH,
            status: UberOpsTicketStatus.OPEN,
            priority: UberOpsTicketPriority.HIGH,
            title: `Uber 商品可售状态同步失败：${input.menuItemStableId}`,
            description: '本地状态已保存；请重试整份菜单发布。',
            menuItemStableId: input.menuItemStableId,
            lastError: message,
            context: {
              publish: {
                storeId: config.storeId,
                dryRun: false,
                taxRateConfirmed: true,
                timezoneConfirmed: true,
              },
              uberStoreId: mapping.uberStoreId,
              externalItemId: config.externalItemId,
              isAvailable: input.isAvailable,
            },
          },
        });
        stores.push({
          storeId: config.storeId,
          uberStoreId: mapping.uberStoreId,
          status: 'FAILED',
          error: message,
        });
      }
    }

    const status: UberAvailabilitySyncStatus = stores.some(
      (store) => store.status === 'FAILED',
    )
      ? 'FAILED'
      : stores.some((store) => store.status === 'PENDING')
        ? 'PENDING'
        : 'SKIPPED_NOT_PUBLISHED';
    await this.telemetry.captureEvent(
      'ubereats_menu_item_availability_sync_requested',
      {
        menuItemStableId: input.menuItemStableId,
        isAvailable: input.isAvailable,
        status,
        stores,
      },
    );
    return { status, stores };
  }

  async syncUberOptionItemAvailability(input: SyncOptionAvailabilityInput) {
    await this.ensureOptionChoiceExists(input.optionChoiceStableId);

    const requestedStoreId = input.storeId?.trim();
    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: {
        isProvisioned: true,
        ...(requestedStoreId ? { uberStoreId: requestedStoreId } : {}),
      },
      select: { uberStoreId: true },
    });
    if (mappings.length === 0) {
      throw new BadRequestException('未找到已 provision 的 Uber 门店');
    }
    const stores: Array<{
      storeId: string;
      uberStoreId: string;
      versionStableId?: string;
    }> = [];
    for (const mapping of mappings) {
      await this.prisma.uberOptionItemConfig.upsert({
        where: {
          storeId_optionChoiceStableId: {
            storeId: mapping.uberStoreId,
            optionChoiceStableId: input.optionChoiceStableId,
          },
        },
        create: {
          storeId: mapping.uberStoreId,
          uberStoreId: mapping.uberStoreId,
          optionChoiceStableId: input.optionChoiceStableId,
          isAvailable: input.isAvailable,
        },
        update: {
          uberStoreId: mapping.uberStoreId,
          isAvailable: input.isAvailable,
        },
      });
      const published = await this.publishUberMenu({
        storeId: mapping.uberStoreId,
        dryRun: false,
        taxRateConfirmed: true,
        timezoneConfirmed: true,
      });
      stores.push({
        storeId: mapping.uberStoreId,
        uberStoreId: mapping.uberStoreId,
        versionStableId: published.versionStableId,
      });
    }

    await this.telemetry.captureEvent(
      'ubereats_option_item_availability_synced',
      {
        storeId: requestedStoreId ?? null,
        optionChoiceStableId: input.optionChoiceStableId,
        isAvailable: input.isAvailable,
        stores,
      },
    );

    return {
      ok: true,
      storeId: requestedStoreId ?? null,
      stores,
    };
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

    const merchantConnection =
      this.prismaAccess.uberMerchantConnectionRepository;
    const row = merchantUberUserId?.trim()
      ? await merchantConnection?.findUnique({
          where: { merchantUberUserId: merchantUberUserId.trim() },
        })
      : await merchantConnection?.findFirst({
          orderBy: { connectedAt: 'desc' },
        });

    if (!row?.encryptedAccessToken) {
      throw new BadRequestException(
        '未找到 Uber 商户授权，请先调用 /oauth/connect-url 和 /oauth/callback 完成授权',
      );
    }

    const resolvedAccessToken = this.credentialVault.decrypt(
      row.encryptedAccessToken,
    );
    const refreshToken = row.encryptedRefreshToken
      ? this.credentialVault.decrypt(row.encryptedRefreshToken)
      : null;
    const resolvedRow = {
      ...row,
      accessToken: resolvedAccessToken,
      refreshToken,
    };
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
        encryptedAccessToken,
        encryptedRefreshToken,
      },
      update: {
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

  async processWebhookEvent(
    eventType: string,
    eventId: string,
    notification: UberMenuNotificationEventV1,
  ) {
    const candidates =
      await this.prismaAccess.uberMenuPublishRepository.findMany({
        where: {
          uberStoreId: notification.storeId,
          status: {
            in: [
              UberMenuPublishStatus.SUBMITTED,
              UberMenuPublishStatus.SUCCEEDED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          versionStableId: true,
          requestPayload: true,
          responsePayload: true,
          status: true,
        },
      });
    const version = candidates.find((candidate) =>
      this.menuVersionHasResourceId(candidate, notification.resourceId),
    );
    const errors = version
      ? this.mapMenuPublishErrors(notification.failures, version.requestPayload)
      : notification.failures;

    if (
      version &&
      notification.status === 'SUCCEEDED' &&
      version.status !== UberMenuPublishStatus.SUCCEEDED
    ) {
      await this.markMenuPublishVersionSuccess(version.id, {
        resource_id: notification.resourceId,
        status: notification.status,
      });
    } else if (version && notification.status === 'FAILED') {
      await this.markMenuPublishVersionFailed(
        version.id,
        errors.map((error) => error.message).join('; ') || 'Uber 菜单处理失败',
        errors,
      );
    }

    await this.telemetry.captureEvent('ubereats_menu_notification_processed', {
      eventType,
      eventId,
      uberStoreId: notification.storeId,
      resourceId: notification.resourceId,
      status: notification.status,
      matchedVersion: Boolean(version),
      errors: errors as unknown as Prisma.JsonArray,
    });
  }

  private menuVersionHasResourceId(
    version: {
      versionStableId: string;
      requestPayload: unknown;
      responsePayload: unknown;
    },
    resourceId: string,
  ) {
    if (version.versionStableId === resourceId) return true;
    const response = this.asObject(version.responsePayload);
    if (this.readString(response?.resource_id, response?.id) === resourceId)
      return true;
    const request = this.asObject(version.requestPayload);
    const menus = Array.isArray(request?.menus) ? request.menus : [];
    return menus.some(
      (menu) => this.readString(this.asObject(menu)?.id) === resourceId,
    );
  }

  private mapMenuPublishErrors(
    errors: UberMenuPublishError[],
    requestPayload: unknown,
  ): UberMenuPublishError[] {
    const payload = this.asObject(requestPayload);
    return errors.map((error) => {
      const match = error.path?.match(
        /(?:^|\.)(items|categories|modifier_groups)\[(\d+)\]/,
      );
      if (!match) return error;
      const collection = Array.isArray(payload?.[match[1]])
        ? (payload?.[match[1]] as unknown[])
        : [];
      const localId = this.readString(
        this.asObject(collection[Number(match[2])])?.id,
      );
      return localId
        ? {
            ...error,
            entityType:
              match[1] === 'items'
                ? 'item'
                : match[1] === 'categories'
                  ? 'category'
                  : 'modifier',
            localId,
          }
        : error;
    });
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
          ingredientsEn: true,
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
            composeUberDisplayName(choice.nameEn, choice.nameZh),
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
          composeUberDisplayName(template.nameEn, template.nameZh),
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
          composeUberDisplayName(menuItem.nameEn, menuItem.nameZh),
        // Website ingredients are reusable English description copy, not a
        // legally complete allergen declaration. Never emit ingredientsZh.
        description:
          itemConfig?.displayDescription?.trim() ||
          menuItem.ingredientsEn?.trim() ||
          null,
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
            composeUberDisplayName(category.nameEn, category.nameZh),
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
    return flattenNestedModifiersForUber(input);
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
    const result = validateUberMenuGraph(graph as never);
    return {
      graph: result.graph as unknown as T,
      warnings: result.warnings,
      errors: result.kind === 'invalid' ? result.errors : [],
    };
  }

  /** Validate the final wire payload. Both preview and upload must pass here. */

  private async validateUberMenuImages(payload: UberMenuUploadPayload) {
    return new UberImageValidator(this.httpClient).validate(payload);
  }

  private buildModifierFlatteningReport(
    graph: {
      items: Array<{ id: string; priceCents: number }>;
      groups: Array<{
        id: string;
        minSelect: number;
        maxSelect: number;
        optionItemIds: string[];
      }>;
    },
    mappings: Array<{
      sourceOptionChoiceStableId: string;
      compositeOptionItemId: string;
      sourcePath: string[];
    }>,
  ) {
    const priceById = new Map(
      graph.items.map((item) => [item.id, item.priceCents]),
    );
    return {
      reference:
        'Uber example menu payload: modifier_options reference ITEM ids',
      optionIdSemantics: 'modifier_options[].id === items[].id',
      groups: graph.groups.map((group) => ({
        groupId: group.id,
        minPermitted: group.minSelect,
        maxPermitted: group.maxSelect,
        optionCount: group.optionItemIds.length,
        valid:
          group.minSelect >= 0 &&
          group.minSelect <= group.maxSelect &&
          group.maxSelect <= group.optionItemIds.length &&
          group.optionItemIds.every((id) => priceById.has(id)),
      })),
      combinations: mappings.map((mapping) => ({
        ...mapping,
        combinedPriceCents:
          priceById.get(mapping.compositeOptionItemId) ?? null,
      })),
    };
  }

  private async getUberMenuSchedule(): Promise<{
    timezone: string;
    serviceAvailability: UberServiceAvailability[];
    taxRatePercentage: number;
    taxRateSource: string;
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
    if (/^(?:UTC|GMT)?[+-]\d{1,2}(?::?\d{2})?$/i.test(timezone)) {
      throw new BadRequestException(
        '夏令时地区不得使用固定 UTC offset，请配置 IANA timezone（例如 America/Toronto）。',
      );
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
    return {
      timezone,
      serviceAvailability,
      taxRatePercentage,
      taxRateSource: 'BusinessConfig.salesTaxRate',
    };
  }

  private async assertUberStoreTimezone(
    uberStoreId: string,
    businessTimezone: string,
    timezoneConfirmed: boolean,
  ): Promise<void> {
    const mapping = await this.prisma.uberStoreMapping.findFirst({
      where: { uberStoreId },
      select: { rawPayload: true },
    });
    const uberTimezone = this.readUberStoreTimezone(mapping?.rawPayload);
    if (uberTimezone && uberTimezone !== businessTimezone) {
      throw new BadRequestException(
        `BusinessConfig.timezone（${businessTimezone}）与 Uber 门店时区（${uberTimezone}）不一致，已阻止正式发布。`,
      );
    }
    if (!uberTimezone && !timezoneConfirmed) {
      throw new BadRequestException(
        `Uber API 未返回门店时区；请在管理页确认 Uber 门店使用 ${businessTimezone} 后再正式发布。`,
      );
    }
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
    return summarizeUberMenuGraph(graph as never);
  }

  private async uploadUberMenu(
    uberStoreId: string,
    payload: UberMenuUploadPayload,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    return this.menuGateway.request({
      path: `/v2/eats/stores/${encodeURIComponent(uberStoreId)}/menus`,
      scope: 'eats.store',
      operation: 'uber.menu.upload',
      method: 'PUT',
      json: payload as unknown as Record<string, unknown>,
      idempotencyKey,
    });
  }

  /**
   * Menu uploads are asynchronous at Uber. Accounts subscribed to menu
   * notifications must wait for the webhook; other accounts verify the menu
   * through the read API instead of treating the PUT response as completion.
   */

  private hasMenuNotificationCapability(): boolean {
    return this.config.menuNotificationsEnabled;
  }

  private async confirmUploadedMenu(
    versionId: string,
    uberStoreId: string,
    requested: UberMenuUploadPayload,
  ): Promise<'SUBMITTED' | 'SUCCEEDED' | 'FAILED'> {
    try {
      const response = await this.menuGateway.request<Record<string, unknown>>({
        path: `/v2/eats/stores/${encodeURIComponent(uberStoreId)}/menus`,
        scope: 'eats.store',
        operation: 'uber.menu.read',
        method: 'GET',
      });
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
      await this.telemetry.captureEvent('ubereats_menu_confirmation_pending', {
        uberStoreId,
        reason: error instanceof Error ? error.message : `${error}`,
      });
      return 'SUBMITTED';
    }
  }

  private async pollUploadedMenuUntilTerminal(
    versionId: string,
    storeId: string,
    uberStoreId: string,
    requested: UberMenuUploadPayload,
  ): Promise<void> {
    const timeoutMs = this.config.menuConfirmTimeoutMs;
    const initialDelayMs = this.config.menuConfirmInitialDelayMs;
    const startedAt = Date.now();
    let delayMs = initialDelayMs;
    while (Date.now() - startedAt < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const current =
        await this.prismaAccess.uberMenuPublishRepository.findUnique({
          where: { id: versionId },
          select: { status: true },
        });
      if (
        current?.status === UberMenuPublishStatus.SUCCEEDED ||
        current?.status === UberMenuPublishStatus.FAILED
      )
        return;
      const status = await this.confirmUploadedMenu(
        versionId,
        uberStoreId,
        requested,
      );
      if (status !== 'SUBMITTED') return;
      delayMs = Math.min(delayMs * 2, this.config.menuConfirmMaxDelayMs);
    }

    // Timeout is deliberately not success: retain SUBMITTED and make the
    // unresolved publication visible to operations without a schema change.
    await this.prismaAccess.uberOpsTicketRepository.create({
      data: {
        storeId,
        type: UberOpsTicketType.MENU_PUBLISH,
        status: UberOpsTicketStatus.OPEN,
        priority: UberOpsTicketPriority.HIGH,
        title: `Uber 菜单发布确认超时：${versionId}`,
        description: `在 ${timeoutMs}ms 内未确认 Uber 菜单发布结果。`,
        context: {
          versionId,
          uberStoreId,
          state: 'TIMED_OUT',
          publish: { storeId, dryRun: false },
        },
      },
    });
    await this.telemetry.captureEvent('ubereats_menu_confirmation_timed_out', {
      versionId,
      uberStoreId,
      timeoutMs,
    });
  }

  private async createMenuPublishVersionStarted(
    storeId: string,
    uberStoreId: string,
    summary: { totalItems: number; changedItems: number },
    payload: UberMenuUploadPayload,
    graph: {
      items: Array<{
        id: string;
        sourceStableId: string;
        priceCents: number;
        isAvailable: boolean;
        title: string;
      }>;
    },
  ) {
    const checksum = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const payloadItemIds = new Set(payload.items.map((item) => item.id));
    const publishedAt = new Date();
    const id = randomUUID();
    const versionStableId = randomUUID();
    const businessVersion = checksum;
    const idempotencyKey = buildUberIdempotencyKey({
      taskId: id,
      resourceId: `${storeId}:${uberStoreId}`,
      action: 'PUBLISH_MENU',
      businessVersion,
    });
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.uberMenuPublishVersion.create({
        data: {
          id,
          versionStableId,
          idempotencyKey,
          businessVersion,
          storeId,
          uberStoreId,
          status: UberMenuPublishStatus.SUBMITTED,
          totalItems: summary.totalItems,
          changedItems: summary.changedItems,
          requestPayload: payload as Prisma.InputJsonValue,
          payload: payload as Prisma.InputJsonValue,
          checksum,
        },
        select: {
          id: true,
          versionStableId: true,
          idempotencyKey: true,
          createdAt: true,
        },
      });
      await tx.uberPublishedMenuItem.createMany({
        data: graph.items
          .filter((item) => payloadItemIds.has(item.id))
          .map((item) => ({
            publishVersionId: created.id,
            storeId,
            uberStoreId,
            uberItemId: item.id,
            menuItemStableId: item.sourceStableId,
            publishedPriceCents: item.priceCents,
            publishedIsAvailable: item.isAvailable,
            publishedName: item.title,
            publishedAt,
          })),
      });
      return created;
    });

    return version;
  }

  private async markMenuPublishVersionSubmitted(
    id: string,
    responsePayload: Record<string, unknown>,
  ) {
    await this.prismaAccess.uberMenuPublishRepository.update({
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
    await this.prismaAccess.uberMenuPublishRepository.update({
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
    await this.prismaAccess.uberMenuPublishRepository.update({
      where: { id },
      data: {
        status: UberMenuPublishStatus.FAILED,
        errorMessage,
        errorDetails: errors as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  }

  private async resolveUberProductStableId(
    tx: Prisma.TransactionClient,
    storeId: string | null | undefined,
    item: ParsedUberOrderItem,
    orderedAt: Date,
  ): Promise<string> {
    let stableId: string | null = null;
    if (item.externalItemId?.startsWith('sanq:')) {
      if (storeId) {
        const snapshot = await tx.uberPublishedMenuItem.findFirst({
          where: {
            uberStoreId: storeId,
            uberItemId: item.externalItemId,
            publishedAt: { lte: orderedAt },
            publishVersion: {
              status: {
                in: [
                  UberMenuPublishStatus.SUBMITTED,
                  UberMenuPublishStatus.SUCCEEDED,
                ],
              },
            },
          },
          orderBy: { publishedAt: 'desc' },
          select: { menuItemStableId: true },
        });
        if (snapshot) stableId = snapshot.menuItemStableId;
      }

      if (!stableId) {
        const localItems = await tx.menuItem.findMany({
          select: { stableId: true },
        });
        const deterministic = localItems.find(
          (candidate) =>
            this.buildStableUberNodeId(
              'item',
              storeId ?? 'default',
              candidate.stableId,
            ) === item.externalItemId,
        );
        if (deterministic) stableId = deterministic.stableId;
      }
    }

    const candidates = [item.stableIdHint, item.externalItemId].filter(
      (value): value is string => !!value,
    );
    if (!stableId && candidates.length) {
      const local = await tx.menuItem.findFirst({
        where: { stableId: { in: candidates } },
        select: { stableId: true },
      });
      if (local) stableId = local.stableId;
      const config =
        !stableId &&
        (await tx.uberItemChannelConfig.findFirst({
          where: {
            AND: [
              ...(storeId
                ? [{ OR: [{ storeId }, { uberStoreId: storeId }] }]
                : []),
              {
                OR: [
                  { externalItemId: { in: candidates } },
                  { menuItemStableId: { in: candidates } },
                ],
              },
            ],
          },
          select: { menuItemStableId: true },
        }));
      if (config) stableId = config.menuItemStableId;
    }
    if (!stableId) {
      // Historical/external items can outlive the menu/config that originally
      // published them. Keep the order consumable and let displayName remain
      // the immutable Uber snapshot used by every UI/print fallback.
      stableId =
        item.stableIdHint?.trim() ||
        item.externalItemId?.trim() ||
        `uber-unmapped-${createHash('sha256')
          .update(item.displayName)
          .digest('hex')
          .slice(0, 20)}`;
      this.telemetry.workflowLog(
        'warn',
        `[ubereats order] unmapped item retained externalItemId=${item.externalItemId ?? 'missing'}`,
      );
    }
    return stableId;
  }

  private async resolveUberStoreIdOrThrow(storeId: string): Promise<string> {
    const row = await this.prisma.uberStoreMapping.findFirst({
      where: {
        uberStoreId: storeId,
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

    return redactUberLogText(rawSummary).slice(0, 500);
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
        ? { detail: redactUberLogText(value.safeDetail) }
        : {}),
      ...(typeof value.operation === 'string'
        ? { operation: value.operation }
        : {}),
    };
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
