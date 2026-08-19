import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuConfigImportMode,
  UberMenuConfigImportPort,
  UberMenuConfigImportPreview,
  UberMenuConfigFields,
  UberMenuConfigKind,
} from '../../application/menu/uber-menu-config-import.ports';
import { UberValidationError } from '../../application/shared/uber-application.error';
import {
  fingerprintUberMenuConfigState,
  type UberMenuConfigFingerprintValue,
} from '../../domain/menu/uber-menu-config-import-fingerprint';
import { normalizeUberStoreId } from '../../domain/merchant/uber-store-id';

type Row = Record<string, unknown>;
type MenuDb = PrismaService | Prisma.TransactionClient;
type Definition = {
  kind: UberMenuConfigKind;
  delegate:
    | 'uberItemChannelConfig'
    | 'uberOptionItemConfig'
    | 'uberModifierGroupConfig'
    | 'uberCategoryConfig';
  keys: string[];
  allowed: string[];
};
const DEFINITIONS: Definition[] = [
  {
    kind: 'items',
    delegate: 'uberItemChannelConfig',
    keys: ['menuItemStableId'],
    allowed: [
      'menuItemStableId',
      'priceCents',
      'isAvailable',
      'displayName',
      'displayDescription',
    ],
  },
  {
    kind: 'options',
    delegate: 'uberOptionItemConfig',
    keys: ['optionChoiceStableId'],
    allowed: [
      'optionChoiceStableId',
      'priceDeltaCents',
      'isAvailable',
      'displayName',
      'displayDescription',
    ],
  },
  {
    kind: 'groups',
    delegate: 'uberModifierGroupConfig',
    keys: ['templateGroupStableId'],
    allowed: [
      'templateGroupStableId',
      'displayName',
      'minSelect',
      'maxSelect',
      'isActive',
    ],
  },
  {
    kind: 'categories',
    delegate: 'uberCategoryConfig',
    keys: ['menuCategoryStableId'],
    allowed: ['menuCategoryStableId', 'displayName', 'sortOrder', 'isActive'],
  },
];
const picked = (row: Row, keys: string[]): UberMenuConfigFields =>
  Object.fromEntries(
    keys.map((key) => [key, row[key] ?? null]),
  ) as UberMenuConfigFields;
const stableKey = (row: Row, keys: string[]) =>
  keys.map((key) => String(row[key])).join(':');
const emptyCount = () => ({ create: 0, update: 0, unchanged: 0, conflicts: 0 });

@Injectable()
export class UberMenuConfigImportPrismaAdapter implements UberMenuConfigImportPort {
  constructor(private readonly prisma: PrismaService) {}
  async preview(
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode,
  ) {
    const [source, target] = await Promise.all([
      this.canonicalStoreId(this.prisma, sourceStoreId),
      this.canonicalStoreId(this.prisma, targetStoreId),
    ]);
    return this.plan(this.prisma, source, target, mode, false);
  }
  async apply(
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode,
    previewFingerprint: string,
    administratorId: string,
  ) {
    const [source, target] = await Promise.all([
      this.canonicalStoreId(this.prisma, sourceStoreId),
      this.canonicalStoreId(this.prisma, targetStoreId),
    ]);
    if (source === target)
      throw new UberValidationError({
        code: 'UBER_MENU_IMPORT_SAME_STORE',
        message: '来源与目标门店不能相同。',
        operation: 'uber.menu.config.import',
      });
    return this.prisma.$transaction(
      async (tx) => {
        const current = await this.plan(tx, source, target, mode, false, false);
        if (current.fingerprint !== previewFingerprint)
          throw new UberValidationError({
            code: 'UBER_MENU_IMPORT_PREVIEW_STALE',
            message: '来源或目标配置在 Preview 后已变化，请重新 Preview。',
            operation: 'uber.menu.config.import',
          });
        return this.plan(tx, source, target, mode, true, true, administratorId);
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async restoreItemPrice(
    storeId: string,
    menuItemStableId: string,
    administratorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const canonicalStoreId = await this.canonicalStoreId(tx, storeId);
      const item = await tx.menuItem.findUnique({
        where: { stableId: menuItemStableId },
        select: { basePriceCents: true, isAvailable: true },
      });
      if (!item)
        throw new UberValidationError({
          code: 'UBER_MENU_ITEM_NOT_FOUND',
          message: '菜单项不存在。',
          operation: 'uber.menu.restore-price',
        });
      await tx.uberItemChannelConfig.upsert({
        where: {
          storeId_menuItemStableId: {
            storeId: canonicalStoreId,
            menuItemStableId,
          },
        },
        create: {
          storeId: canonicalStoreId,
          menuItemStableId,
          priceCents: null,
          isAvailable: item.isAvailable,
        },
        update: { priceCents: null },
      });
      const occurredAt = new Date();
      await tx.opsEvent.create({
        data: {
          eventName: 'ubereats_menu_price_restored',
          source: 'ubereats',
          payload: {
            posStoreId: canonicalStoreId,
            menuItemStableId,
            sourcePriceCents: item.basePriceCents,
            administratorId,
            occurredAt: occurredAt.toISOString(),
          },
          occurredAt,
        },
      });
      return { sourcePriceCents: item.basePriceCents };
    });
  }
  async restoreOptionPrice(
    storeId: string,
    optionChoiceStableId: string,
    administratorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const canonicalStoreId = await this.canonicalStoreId(tx, storeId);
      const option = await tx.menuOptionTemplateChoice.findUnique({
        where: { stableId: optionChoiceStableId },
        select: { priceDeltaCents: true, isAvailable: true },
      });
      if (!option)
        throw new UberValidationError({
          code: 'UBER_MENU_OPTION_NOT_FOUND',
          message: '菜单选项不存在。',
          operation: 'uber.menu.restore-option-price',
        });
      await tx.uberOptionItemConfig.upsert({
        where: {
          storeId_optionChoiceStableId: {
            storeId: canonicalStoreId,
            optionChoiceStableId,
          },
        },
        create: {
          storeId: canonicalStoreId,
          optionChoiceStableId,
          priceDeltaCents: option.priceDeltaCents,
          isAvailable: option.isAvailable,
        },
        update: { priceDeltaCents: option.priceDeltaCents },
      });
      const occurredAt = new Date();
      await tx.opsEvent.create({
        data: {
          eventName: 'ubereats_menu_price_restored',
          source: 'ubereats',
          payload: {
            posStoreId: canonicalStoreId,
            optionChoiceStableId,
            sourcePriceDeltaCents: option.priceDeltaCents,
            administratorId,
            occurredAt: occurredAt.toISOString(),
          },
          occurredAt,
        },
      });
      return { sourcePriceDeltaCents: option.priceDeltaCents };
    });
  }
  private async canonicalStoreId(db: MenuDb, storeId: string) {
    const requestedStoreId = normalizeUberStoreId(storeId);
    const mapping = await db.uberStoreMapping.findFirst({
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
  private async plan(
    db: MenuDb,
    sourceStoreId: string,
    targetStoreId: string,
    mode: UberMenuConfigImportMode,
    write: boolean,
    audit = true,
    administratorId?: string,
  ): Promise<UberMenuConfigImportPreview> {
    const counts = Object.fromEntries(
      DEFINITIONS.map((definition) => [definition.kind, emptyCount()]),
    ) as UberMenuConfigImportPreview['counts'];
    const conflicts: UberMenuConfigImportPreview['conflicts'] = [];
    const fingerprintState: Array<Record<string, unknown>> = [];
    for (const definition of DEFINITIONS) {
      const delegate = db[definition.delegate] as unknown as {
        findMany(args: object): Promise<Row[]>;
        create(args: object): Promise<unknown>;
        update(args: object): Promise<unknown>;
      };
      const [source, target] = await Promise.all([
        delegate.findMany({ where: { storeId: sourceStoreId } }),
        delegate.findMany({ where: { storeId: targetStoreId } }),
      ]);
      const targets = new Map(
        target.map((row) => [stableKey(row, definition.keys), row]),
      );
      fingerprintState.push({
        kind: definition.kind,
        source: source
          .map((row) => picked(row, definition.allowed))
          .sort((a, b) =>
            stableKey(a, definition.keys).localeCompare(
              stableKey(b, definition.keys),
            ),
          ),
        target: target
          .map((row) => picked(row, definition.allowed))
          .sort((a, b) =>
            stableKey(a, definition.keys).localeCompare(
              stableKey(b, definition.keys),
            ),
          ),
      });
      for (const row of source) {
        const safe = picked(row, definition.allowed);
        const key = stableKey(row, definition.keys);
        const existing = targets.get(key);
        if (!existing) {
          counts[definition.kind].create++;
          if (write)
            await delegate.create({
              data: { storeId: targetStoreId, ...safe },
            });
          continue;
        }
        const same =
          JSON.stringify(safe) ===
          JSON.stringify(picked(existing, definition.allowed));
        if (same) {
          counts[definition.kind].unchanged++;
          continue;
        }
        counts[definition.kind].conflicts++;
        conflicts.push({
          kind: definition.kind,
          stableId: key,
          source: safe,
          target: picked(existing, definition.allowed),
        });
        if (mode === 'OVERWRITE') {
          counts[definition.kind].update++;
          if (write)
            await delegate.update({ where: { id: existing.id }, data: safe });
        }
      }
    }
    const fingerprint = fingerprintUberMenuConfigState({
      sourceStoreId,
      targetStoreId,
      mode,
      fingerprintState,
    } as UberMenuConfigFingerprintValue);
    if (write && audit)
      await db.opsEvent.create({
        data: {
          eventName: 'ubereats_menu_config_import_applied',
          source: 'ubereats',
          payload: {
            sourceStoreId,
            targetStoreId,
            mode,
            conflictCount: conflicts.length,
            administratorId,
            previewFingerprint: fingerprint,
          },
        },
      });
    else if (audit)
      await db.opsEvent.create({
        data: {
          eventName: 'ubereats_menu_config_import_previewed',
          source: 'ubereats',
          payload: {
            sourceStoreId,
            targetStoreId,
            mode,
            conflictCount: conflicts.length,
            previewFingerprint: fingerprint,
          },
        },
      });
    return {
      fingerprint,
      sourceStoreId,
      targetStoreId,
      mode,
      counts,
      conflicts,
      warnings: [],
    };
  }
}
