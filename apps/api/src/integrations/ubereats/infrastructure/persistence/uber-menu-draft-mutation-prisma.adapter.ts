import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberValidationError } from '../../application/shared/uber-application.error';
import type {
  UberDraftGroupCommandPort,
  UberDraftItemCommandPort,
  UberDraftOptionCommandPort,
} from '../../application/menu/uber-menu-draft.ports';
import {
  readUberPreparationType,
  type UpdateDraftItemInput,
  type UpdateDraftOptionInput,
} from '../../domain/menu/uber-menu.types';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';

const uberMenuValidation = (message: string) =>
  new UberValidationError({
    code: 'UBER_MENU_INPUT_INVALID',
    message,
    operation: 'menu.validate',
    upstreamStatus: null,
  });

@Injectable()
export class UberMenuDraftMutationPrismaAdapter
  implements
    UberDraftItemCommandPort,
    UberDraftGroupCommandPort,
    UberDraftOptionCommandPort
{
  constructor(private readonly prisma: PrismaService) {}

  async updateUberDraftItem(itemId: string, input: UpdateDraftItemInput) {
    const normalizedStoreId = await this.canonicalStoreId(input.storeId);

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
        preparationType: input.preparationType ?? null,
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
        ...(input.preparationType !== undefined
          ? { preparationType: input.preparationType }
          : {}),
      },
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      itemId,
      config: {
        ...row,
        preparationType: readUberPreparationType(row.preparationType),
      },
      warnings:
        input.sortOrder !== undefined
          ? ['当前没有 Uber item 独立 sortOrder 字段，已忽略 sortOrder 更新。']
          : [],
    };
  }

  async updateUberDraftGroup(
    command: import('../../application/menu/uber-menu-draft.ports').UberGroupConfigCommand,
  ) {
    const groupId = command.resourceKey.templateGroupStableId;
    const input = command.payload;
    const normalizedStoreId = await this.canonicalStoreId(
      command.resourceKey.storeId,
    );
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
    const normalizedStoreId = await this.canonicalStoreId(input.storeId);
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
        preparationType: input.preparationType ?? null,
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
        ...(input.preparationType !== undefined
          ? { preparationType: input.preparationType }
          : {}),
      },
    });

    return {
      ok: true,
      storeId: normalizedStoreId,
      optionItemId,
      config: {
        ...row,
        preparationType: readUberPreparationType(row.preparationType),
      },
      warnings:
        input.sortOrder !== undefined
          ? [
              '当前没有 Uber option 独立 sortOrder 字段，已忽略 sortOrder 更新。',
            ]
          : [],
    };
  }

  private async canonicalStoreId(storeId?: string) {
    const requestedStoreId = normalizeUberStoreId(storeId);
    const mapping = await this.prisma.uberStoreMapping.findFirst({
      where: {
        isProvisioned: true,
        OR: [
          { posExternalStoreId: requestedStoreId },
          { uberStoreId: requestedStoreId },
        ],
      },
      select: { posExternalStoreId: true },
    });
    return mapping?.posExternalStoreId?.trim() || requestedStoreId;
  }
}
