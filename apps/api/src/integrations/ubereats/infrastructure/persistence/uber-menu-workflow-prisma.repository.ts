import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  UberMenuPublishStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberValidationError } from '../../application/errors/uber-application.error';
import type {
  UberMenuConfigQueryPort,
  UberMenuConfigWritePort,
  UberMenuDraftDiffPort,
  UberMenuDraftMutationPort,
  UberMenuDraftReadPort,
  UberMenuReferenceQueryPort,
} from '../../application/ports/uber-menu-draft-workflow.ports';
import {
  UBER_MENU_PUBLISH_COMMAND,
  type UberMenuPublishCommandPort,
} from '../../application/ports/uber-menu-publication.ports';
import { UberAuthService } from '../uber-api/uber-token.provider';
import {
  UberConfigService,
  type UberMenuConfig,
} from '../config/uber-config.service';
import { normalizeUberStoreId } from '../../domain/shared/uber-integration.utils';
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
import type { UberServiceAvailability } from '../../domain/menu/uber-payload.utils';
import { UberCredentialVaultService } from '../crypto/uber-credential-vault.service';
import {
  buildUberUploadMenuPayload,
  validateUberMenuPayload,
} from '../../domain/menu/uber-menu-payload.builder';
import {
  buildUberMenuGraph,
  buildUberNodeId,
  validateUberMenuGraph,
  summarizeUberMenuGraph,
} from '../../domain/menu/uber-menu-graph.service';

import {
  readStoreTimezone,
  UberMenuDraftSourcePrismaRepository,
} from './uber-menu-draft.repositories';
import { emptyUberMenuDraftFilters } from '../../domain/menu/uber-menu-draft-source';
import {
  buildDraftCategories,
  buildUberDraftEdges,
  buildUberDraftTreeNodes,
} from '../../domain/menu/uber-menu-draft.projector';
import { buildUberMenuDraftDiff } from '../../domain/menu/uber-menu-diff.service';
import { UberTelemetryService } from './uber-telemetry.service';
import {
  validateUberBusinessSchedule,
  validateUberStoreTimezone,
} from '../../domain/menu/uber-business-schedule.validator';
import { summarizeWebhookError } from '../uber-api/uber-error.mapper';

const uberMenuValidation = (message: string) =>
  new UberValidationError({
    code: 'UBER_MENU_INPUT_INVALID',
    message,
    operation: 'menu.validate',
    upstreamStatus: null,
  });

@Injectable()
export class UberMenuDraftGateway
  implements
    UberMenuConfigQueryPort,
    UberMenuConfigWritePort,
    UberMenuDraftReadPort,
    UberMenuDraftMutationPort,
    UberMenuDraftDiffPort,
    UberMenuReferenceQueryPort
{
  private static readonly UBER_MODIFIER_COMBINATION_LIMIT = 100;
  private readonly telemetry: UberTelemetryService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uberAuthService: UberAuthService,
    @Inject(UberConfigService) private readonly config: UberMenuConfig,
    @Inject(UBER_MENU_PUBLISH_COMMAND)
    private readonly publishMenu: UberMenuPublishCommandPort,
    @Optional()
    private readonly credentialVault = new UberCredentialVaultService(),
    @Optional() telemetry?: UberTelemetryService,
  ) {
    this.telemetry = telemetry ?? new UberTelemetryService(prisma);
  }

  validateUberMenuPayload(payload: UberMenuUploadPayload) {
    return validateUberMenuPayload(payload);
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
    const validation = validateUberMenuGraph(graph);
    const normalized = {
      graph: validation.graph,
      warnings: validation.warnings,
      errors: validation.kind === 'invalid' ? validation.errors : [],
    };
    const schedule = await this.getUberMenuSchedule();
    const payload = buildUberUploadMenuPayload(
      normalized.graph,
      schedule.serviceAvailability,
      schedule.taxRatePercentage,
    );
    const payloadValidation = validateUberMenuPayload(payload);
    const summary = summarizeUberMenuGraph(normalized.graph);
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

    const uberDraftCategories = buildDraftCategories(normalized.graph);
    const sourceDraftCategories = buildDraftCategories({
      categories: graph.categories,
      groups: graph.sourceGroups,
      items: graph.sourceItems,
    });
    const uberDraftTreeNodes = buildUberDraftTreeNodes(uberDraftCategories);

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
        edges: buildUberDraftEdges(normalized.graph),
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

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { stableId: itemId },
      select: { basePriceCents: true, isAvailable: true },
    });
    if (!menuItem) {
      throw uberMenuValidation(`菜单项 ${itemId} 不存在`);
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
      throw uberMenuValidation(`选项模板组 ${groupId} 不存在`);
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
    const choice = await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId: optionItemId },
      select: { priceDeltaCents: true, isAvailable: true },
    });
    if (!choice) {
      throw uberMenuValidation(`选项 ${optionItemId} 不存在`);
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
      throw uberMenuValidation(`选项 ${optionItemId} 不存在`);
    }

    const childGroup = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: { stableId: true },
    });
    if (!childGroup) {
      throw uberMenuValidation(`模板组 ${groupId} 不存在`);
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
      throw uberMenuValidation(`选项 ${optionItemId} 不存在`);
    }

    const childGroup = await this.prisma.menuOptionGroupTemplate.findUnique({
      where: { stableId: groupId },
      select: { stableId: true },
    });
    if (!childGroup) {
      throw uberMenuValidation(`模板组 ${groupId} 不存在`);
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
    return buildUberMenuDraftDiff({
      storeId: normalizedStoreId,
      draft,
      lastPublishedAt: lastSuccess?.createdAt ?? null,
      publishedPayload:
        lastSuccess?.requestPayload ?? lastSuccess?.payload ?? null,
      publishedMenuItemIds: itemConfigs.map((item) => item.menuItemStableId),
      publishedOptionItemIds: optionConfigs.map(
        (item) => item.optionChoiceStableId,
      ),
    });
  }

  async publishUberMenu(input: PublishMenuInput) {
    return this.publishMenu.execute(input);
  }

  async syncUberMenuItemAvailability(
    input: SyncAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult> {
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
        const message = summarizeWebhookError(error);
        await this.prisma.uberOpsTicket.create({
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

  async syncUberOptionItemAvailability(
    input: SyncOptionAvailabilityInput,
  ): Promise<UberAvailabilitySyncResult> {
    const requestedStoreId = input.storeId?.trim();
    const mappings = await this.prisma.uberStoreMapping.findMany({
      where: {
        isProvisioned: true,
        ...(requestedStoreId ? { uberStoreId: requestedStoreId } : {}),
      },
      select: { uberStoreId: true },
    });
    if (mappings.length === 0) {
      throw uberMenuValidation('未找到已 provision 的 Uber 门店');
    }
    const stores: UberAvailabilitySyncResult['stores'] = [];
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
        status: 'PENDING',
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
      status: 'PENDING',
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

    const merchantConnection = this.prisma.uberMerchantConnection;
    const row = merchantUberUserId?.trim()
      ? await merchantConnection?.findUnique({
          where: { merchantUberUserId: merchantUberUserId.trim() },
        })
      : await merchantConnection?.findFirst({
          orderBy: { connectedAt: 'desc' },
        });

    if (!row?.encryptedAccessToken) {
      throw uberMenuValidation(
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
      throw uberMenuValidation(
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
    const merchantConnection = this.prisma.uberMerchantConnection;

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
    return input;
  }

  private async buildUberMenuGraph(storeId: string, uberStoreId: string) {
    const source = await new UberMenuDraftSourcePrismaRepository(
      this.prisma,
    ).load(storeId, uberStoreId);
    return buildUberMenuGraph(source, emptyUberMenuDraftFilters());
  }

  /**
   * Turn the generated menu into a closed, reachable Uber graph. Validation is
   * deliberately performed here (rather than while reading Prisma rows) so
   * exclusions, channel availability and nested-option flattening have already
   * taken effect.
   */
  /** Validate the final wire payload. Both preview and upload must pass here. */

  async findMenuItemByStableId(stableId: string) {
    return await this.prisma.menuItem.findUnique({
      where: { stableId },
      select: { stableId: true },
    });
  }

  async findOptionChoiceByStableId(stableId: string) {
    return await this.prisma.menuOptionTemplateChoice.findUnique({
      where: { stableId },
      select: { stableId: true },
    });
  }

  async findProvisionedStoreMapping(storeId: string) {
    return await this.prisma.uberStoreMapping.findFirst({
      where: { uberStoreId: storeId, isProvisioned: true },
      select: { uberStoreId: true, rawPayload: true },
    });
  }

  async readBusinessSchedule() {
    const [config, hours] = await Promise.all([
      this.prisma.businessConfig.findUnique({
        where: { id: 1 },
        select: { timezone: true, salesTaxRate: true },
      }),
      this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
    ]);
    return config ? { ...config, hours } : null;
  }

  private async getUberMenuSchedule(): Promise<{
    timezone: string;
    serviceAvailability: UberServiceAvailability[];
    taxRatePercentage: number;
    taxRateSource: string;
  }> {
    const result = validateUberBusinessSchedule(
      await this.readBusinessSchedule(),
    );
    if (!result.valid) throw uberMenuValidation(result.message);
    return { ...result, taxRateSource: 'BusinessConfig.salesTaxRate' };
  }

  private async assertUberStoreTimezone(
    uberStoreId: string,
    businessTimezone: string,
    timezoneConfirmed: boolean,
  ): Promise<void> {
    const mapping = await this.findProvisionedStoreMapping(uberStoreId);
    const message = validateUberStoreTimezone({
      businessTimezone,
      uberTimezone: readStoreTimezone(mapping?.rawPayload),
      timezoneConfirmed,
    });
    if (message) throw uberMenuValidation(message);
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
            buildUberNodeId(
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
}
