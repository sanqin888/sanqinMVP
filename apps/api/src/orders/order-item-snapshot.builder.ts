import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MenuItemOptionGroup,
  MenuOptionGroupTemplate,
  MenuOptionTemplateChoice,
  Prisma,
} from '@prisma/client';
import { isAvailableNow } from '@shared/menu';

import { PrismaService } from './orders-prisma';
import type {
  OrderItemComponentSnapshot,
  OrderItemComponentsSnapshot,
} from './order-item-components';
import type {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
  OrderItemOptionsSnapshot,
} from './order-item-options';

type MenuItemWithOptions = Prisma.MenuItemGetPayload<{
  include: {
    fixedComponents: true;
    optionGroups: {
      include: {
        templateGroup: {
          include: {
            options: true;
          };
        };
      };
    };
  };
}>;

type OptionChoiceContext = {
  choice: MenuOptionTemplateChoice;
  group: MenuOptionGroupTemplate;
  link: MenuItemOptionGroup;
};

export type OrderItemSnapshotBuildInput = {
  productStableId: string;
  qty: number;
  displayName?: string | null;
  /** Canonical request selections keyed by template/group path. */
  options?: Record<string, unknown>;
  /** Existing immutable option snapshot, used by amendment ADD/SWAP re-materialization. */
  optionsSnapshot?: unknown;
};

export type CanonicalOrderItemConfigurationSnapshot = {
  normalizedProductId: string;
  productStableId: string;
  qty: number;
  displayName: string;
  nameEn: string;
  nameZh: string | null;
  basePriceCents: number;
  optionsUnitPriceCents: number;
  optionsSnapshot: OrderItemOptionsSnapshot;
  componentSnapshots: OrderItemComponentsSnapshot;
};

type SelectedOptionRef = {
  optionId: string;
  groupKey?: string;
  sequence: number;
};

function availabilityFromDb(
  isAvailable: boolean,
  tempUnavailableUntil: Date | null,
) {
  return {
    isAvailable,
    tempUnavailableUntil: tempUnavailableUntil
      ? tempUnavailableUntil.toISOString()
      : null,
  };
}

/**
 * Orders-owned canonical builder for immutable OrderItem configuration snapshots.
 *
 * It resolves the current menu graph once and produces the two complementary
 * historical facts used by Orders consumers:
 * - optionsSnapshot: what the customer selected;
 * - componentSnapshots: what actual menu items that parent line contains.
 *
 * Pricing policy, Daily Special application, promotion evaluation and order-level
 * totals deliberately remain outside this builder.
 */
@Injectable()
export class OrderItemSnapshotBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async buildMany(
    inputs: OrderItemSnapshotBuildInput[],
  ): Promise<CanonicalOrderItemConfigurationSnapshot[]> {
    const normalizedItems = inputs.map((item) => {
      const normalizedProductId = item.productStableId.trim();
      if (!normalizedProductId) {
        throw new BadRequestException('Product id is required');
      }
      if (!Number.isFinite(item.qty) || item.qty <= 0) {
        throw new BadRequestException('qty must be > 0');
      }
      return {
        ...item,
        qty: Math.round(item.qty),
        normalizedProductId,
        selectionOptions:
          item.options ??
          this.restoreSelectionsFromSnapshot(item.optionsSnapshot),
      };
    });

    if (normalizedItems.length === 0) return [];

    const productIds = normalizedItems.map((item) => item.normalizedProductId);
    const dbProducts = await this.prisma.menuItem.findMany({
      where: {
        OR: [{ id: { in: productIds } }, { stableId: { in: productIds } }],
      },
      include: {
        fixedComponents: { orderBy: { sortOrder: 'asc' } },
        optionGroups: {
          where: { isEnabled: true },
          include: {
            templateGroup: {
              include: { options: { where: { deletedAt: null } } },
            },
          },
        },
      },
    });

    const productMap = new Map<string, MenuItemWithOptions>();
    const choiceLookupByProductId = new Map<
      string,
      Map<string, OptionChoiceContext>
    >();
    const itemAvailabilityByStableId = new Map<string, boolean>();

    const setItemAvailability = (
      stableId: string,
      isAvailable: boolean,
      tempUnavailableUntil: Date | null,
    ) => {
      itemAvailabilityByStableId.set(
        stableId,
        isAvailableNow(availabilityFromDb(isAvailable, tempUnavailableUntil)),
      );
    };

    const addProductOptionChoices = (
      optionLookup: Map<string, OptionChoiceContext>,
      product: MenuItemWithOptions,
    ) => {
      for (const link of product.optionGroups ?? []) {
        if (!link.isEnabled || !link.templateGroup) continue;
        const templateGroup = link.templateGroup;
        if ((templateGroup as { deletedAt?: Date | null }).deletedAt) continue;

        const choices = (templateGroup.options ?? []).filter((choice) => {
          const deleted = (choice as { deletedAt?: Date | null }).deletedAt;
          if (deleted) return false;
          if (
            !isAvailableNow(
              availabilityFromDb(
                choice.isAvailable,
                choice.tempUnavailableUntil,
              ),
            )
          ) {
            return false;
          }
          const targetItemStableId = choice.targetItemStableId?.trim();
          if (!targetItemStableId) return true;
          return itemAvailabilityByStableId.get(targetItemStableId) !== false;
        });

        for (const choice of choices) {
          const context = { choice, group: templateGroup, link };
          optionLookup.set(choice.id, context);
          optionLookup.set(choice.stableId, context);
        }
      }
    };

    for (const product of dbProducts) {
      productMap.set(product.id, product);
      productMap.set(product.stableId, product);
      setItemAvailability(
        product.stableId,
        product.isAvailable,
        product.tempUnavailableUntil,
      );
      const optionLookup = new Map<string, OptionChoiceContext>();
      addProductOptionChoices(optionLookup, product);
      choiceLookupByProductId.set(product.id, optionLookup);
      choiceLookupByProductId.set(product.stableId, optionLookup);
    }

    const linkedProductByStableId = new Map<
      string,
      MenuItemWithOptions | null
    >();
    const ensureLinkedProductByStableId = async (
      stableId: string,
    ): Promise<MenuItemWithOptions | null> => {
      if (linkedProductByStableId.has(stableId)) {
        return linkedProductByStableId.get(stableId) ?? null;
      }
      const linkedProduct = await this.prisma.menuItem.findFirst({
        where: { stableId, deletedAt: null },
        include: {
          fixedComponents: { orderBy: { sortOrder: 'asc' } },
          optionGroups: {
            where: { isEnabled: true },
            include: {
              templateGroup: {
                include: { options: { where: { deletedAt: null } } },
              },
            },
          },
        },
      });
      linkedProductByStableId.set(stableId, linkedProduct);
      if (linkedProduct) {
        setItemAvailability(
          linkedProduct.stableId,
          linkedProduct.isAvailable,
          linkedProduct.tempUnavailableUntil,
        );
      }
      return linkedProduct;
    };

    const prepareFixedComponentTree = async (
      product: MenuItemWithOptions,
      optionLookup: Map<string, OptionChoiceContext>,
      visiting = new Set<string>(),
    ): Promise<void> => {
      if (visiting.has(product.stableId)) {
        throw new BadRequestException(
          `Fixed combo component cycle detected at ${product.stableId}`,
        );
      }
      const nextVisiting = new Set(visiting);
      nextVisiting.add(product.stableId);

      for (const component of product.fixedComponents ?? []) {
        const linkedProduct = await ensureLinkedProductByStableId(
          component.componentItemStableId,
        );
        if (!linkedProduct) {
          throw new BadRequestException(
            `Fixed component item not found: ${component.componentItemStableId}`,
          );
        }
        if (
          !isAvailableNow(
            availabilityFromDb(
              linkedProduct.isAvailable,
              linkedProduct.tempUnavailableUntil,
            ),
          )
        ) {
          throw new BadRequestException(
            `Fixed component item not available: ${component.componentItemStableId}`,
          );
        }
        addProductOptionChoices(optionLookup, linkedProduct);
        await prepareFixedComponentTree(
          linkedProduct,
          optionLookup,
          nextVisiting,
        );
      }
    };

    const snapshots: CanonicalOrderItemConfigurationSnapshot[] = [];
    for (const item of normalizedItems) {
      const product = productMap.get(item.normalizedProductId);
      if (!product) {
        throw new BadRequestException(
          `Product not found or unavailable: ${item.normalizedProductId}`,
        );
      }
      if (
        !isAvailableNow(
          availabilityFromDb(product.isAvailable, product.tempUnavailableUntil),
        )
      ) {
        throw new BadRequestException(
          `Product not available: ${item.normalizedProductId}`,
        );
      }

      const selectedOptionRefs = this.collectOptionSelectionRefs(
        item.selectionOptions,
      );
      const selectedOptionIds = selectedOptionRefs.map((ref) => ref.optionId);
      const baseOptionLookup =
        choiceLookupByProductId.get(item.normalizedProductId) ??
        new Map<string, OptionChoiceContext>();
      const optionLookup = new Map(baseOptionLookup);
      await prepareFixedComponentTree(product, optionLookup);

      const processedSelectedOptionIds = new Set<string>();
      const expandedTargetItems = new Set<string>();
      const pendingSelectedOptionIds = [...selectedOptionIds];
      while (pendingSelectedOptionIds.length > 0) {
        const optionId = pendingSelectedOptionIds.pop();
        if (!optionId || processedSelectedOptionIds.has(optionId)) continue;
        processedSelectedOptionIds.add(optionId);
        const context = optionLookup.get(optionId);
        if (!context) continue;
        const targetItemStableId = context.choice.targetItemStableId?.trim();
        if (
          !targetItemStableId ||
          expandedTargetItems.has(targetItemStableId)
        ) {
          continue;
        }
        expandedTargetItems.add(targetItemStableId);
        const linkedProduct =
          await ensureLinkedProductByStableId(targetItemStableId);
        if (!linkedProduct) continue;
        addProductOptionChoices(optionLookup, linkedProduct);
        selectedOptionIds.forEach((selectedId) => {
          if (!processedSelectedOptionIds.has(selectedId)) {
            pendingSelectedOptionIds.push(selectedId);
          }
        });
      }

      let optionsUnitPriceCents = 0;
      const optionGroupSnapshots = new Map<
        string,
        OrderItemOptionGroupSnapshot & { sequence: number }
      >();
      for (const selectedRef of selectedOptionRefs) {
        const optionId = selectedRef.optionId;
        const context = optionLookup.get(optionId);
        if (!context) {
          throw new BadRequestException(
            `Option not found or unavailable: ${optionId} for product ${item.normalizedProductId}`,
          );
        }
        const targetItemStableId = context.choice.targetItemStableId?.trim();
        if (targetItemStableId) {
          const cachedTargetAvailability =
            itemAvailabilityByStableId.get(targetItemStableId);
          if (cachedTargetAvailability === false) {
            throw new BadRequestException(
              `Option not available because target item is unavailable: ${optionId}`,
            );
          }
          if (cachedTargetAvailability === undefined) {
            const linkedTarget =
              await ensureLinkedProductByStableId(targetItemStableId);
            const isTargetAvailable =
              !!linkedTarget &&
              isAvailableNow(
                availabilityFromDb(
                  linkedTarget.isAvailable,
                  linkedTarget.tempUnavailableUntil,
                ),
              );
            if (!isTargetAvailable) {
              throw new BadRequestException(
                `Option not available because target item is unavailable: ${optionId}`,
              );
            }
          }
        }

        optionsUnitPriceCents += context.choice.priceDeltaCents;
        const templateGroupStableId = context.group.stableId;
        const snapshotKey = selectedRef.groupKey
          ? `${templateGroupStableId}::${selectedRef.groupKey}`
          : templateGroupStableId;
        const groupSnapshot =
          optionGroupSnapshots.get(snapshotKey) ??
          ({
            templateGroupStableId,
            groupKey: selectedRef.groupKey ?? null,
            nameEn: context.group.nameEn,
            nameZh: context.group.nameZh ?? null,
            minSelect:
              typeof context.link?.minSelect === 'number'
                ? context.link.minSelect
                : context.group.defaultMinSelect,
            maxSelect:
              context.link?.maxSelect ?? context.group.defaultMaxSelect ?? null,
            sortOrder:
              typeof context.link?.sortOrder === 'number'
                ? context.link.sortOrder
                : (context.group.sortOrder ?? 0),
            sequence: selectedRef.sequence,
            choices: [] as OrderItemOptionChoiceSnapshot[],
          } satisfies OrderItemOptionGroupSnapshot & { sequence: number });

        groupSnapshot.choices.push({
          stableId: context.choice.stableId,
          templateGroupStableId,
          targetItemStableId: context.choice.targetItemStableId?.trim() || null,
          nameEn: context.choice.nameEn,
          nameZh: context.choice.nameZh ?? null,
          priceDeltaCents: context.choice.priceDeltaCents,
          sortOrder: selectedRef.sequence,
        });
        optionGroupSnapshots.set(snapshotKey, groupSnapshot);
      }

      const optionsSnapshot: OrderItemOptionsSnapshot = Array.from(
        optionGroupSnapshots.values(),
      )
        .map((group) => ({
          ...group,
          choices: [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder),
        }))
        .sort((a, b) => {
          if (a.sequence !== b.sequence) return a.sequence - b.sequence;
          return a.sortOrder - b.sortOrder;
        })
        .map((group) => {
          const { sequence, ...snapshot } = group;
          void sequence;
          return snapshot;
        });

      const componentSnapshots: OrderItemComponentsSnapshot = [];
      const componentPathQuantity = new Map<string, number>();
      const optionGroupsUnderPath = (
        pathKey: string,
      ): OrderItemOptionsSnapshot =>
        optionsSnapshot.filter((group) =>
          group.groupKey?.startsWith(`${pathKey}__`),
        );

      const appendFixedComponentSnapshots = async (
        parent: MenuItemWithOptions,
        basePathKey: string,
        parentQuantity: number,
        visiting = new Set<string>(),
      ): Promise<void> => {
        if (visiting.has(parent.stableId)) return;
        const nextVisiting = new Set(visiting);
        nextVisiting.add(parent.stableId);
        for (const component of parent.fixedComponents ?? []) {
          const linkedProduct = await ensureLinkedProductByStableId(
            component.componentItemStableId,
          );
          if (!linkedProduct) continue;
          const quantityPerParent =
            parentQuantity * Math.max(1, Math.trunc(component.quantity));
          const componentPathKey = `${basePathKey}__component-${component.componentItemStableId}`;
          componentPathQuantity.set(componentPathKey, quantityPerParent);
          if ((linkedProduct.fixedComponents ?? []).length > 0) {
            await appendFixedComponentSnapshots(
              linkedProduct,
              componentPathKey,
              quantityPerParent,
              nextVisiting,
            );
            continue;
          }
          componentSnapshots.push({
            productStableId: linkedProduct.stableId,
            nameEn: linkedProduct.nameEn,
            nameZh: linkedProduct.nameZh ?? null,
            quantityPerParent,
            source: 'FIXED',
            options: optionGroupsUnderPath(componentPathKey),
          });
        }
      };

      await appendFixedComponentSnapshots(
        product,
        `root__${product.stableId}`,
        1,
      );

      const quantityForGroupPath = (groupKey: string | null | undefined) => {
        if (!groupKey) return 1;
        let multiplier = 1;
        let matchedLength = -1;
        for (const [pathKey, quantity] of componentPathQuantity) {
          if (
            (groupKey === pathKey || groupKey.startsWith(`${pathKey}__`)) &&
            pathKey.length > matchedLength
          ) {
            multiplier = quantity;
            matchedLength = pathKey.length;
          }
        }
        return multiplier;
      };

      for (const group of optionsSnapshot) {
        for (const choice of group.choices) {
          const targetItemStableId = choice.targetItemStableId?.trim();
          if (!targetItemStableId) continue;
          const linkedProduct =
            await ensureLinkedProductByStableId(targetItemStableId);
          const targetPathKey = group.groupKey
            ? `${group.groupKey}__option-${choice.stableId}`
            : null;
          const optionComponent: OrderItemComponentSnapshot = {
            productStableId: targetItemStableId,
            nameEn: linkedProduct?.nameEn ?? choice.nameEn,
            nameZh: linkedProduct?.nameZh ?? choice.nameZh ?? null,
            quantityPerParent: quantityForGroupPath(group.groupKey),
            source: 'OPTION',
            sourceOptionStableId: choice.stableId,
            options: targetPathKey ? optionGroupsUnderPath(targetPathKey) : [],
          };
          componentSnapshots.push(optionComponent);
        }
      }

      snapshots.push({
        normalizedProductId: item.normalizedProductId,
        productStableId: product.stableId,
        qty: item.qty,
        displayName:
          product.nameEn || product.nameZh || item.displayName || 'Unknown',
        nameEn: product.nameEn,
        nameZh: product.nameZh ?? null,
        basePriceCents: product.basePriceCents,
        optionsUnitPriceCents,
        optionsSnapshot,
        componentSnapshots,
      });
    }

    return snapshots;
  }

  private restoreSelectionsFromSnapshot(
    value: unknown,
  ): Record<string, unknown> | undefined {
    if (!Array.isArray(value)) return undefined;
    const selections: Record<string, unknown> = {};
    for (const rawGroup of value) {
      if (
        !rawGroup ||
        typeof rawGroup !== 'object' ||
        Array.isArray(rawGroup)
      ) {
        continue;
      }
      const group = rawGroup as Record<string, unknown>;
      const templateGroupStableId =
        typeof group.templateGroupStableId === 'string'
          ? group.templateGroupStableId.trim()
          : '';
      const groupKey =
        typeof group.groupKey === 'string' && group.groupKey.trim()
          ? group.groupKey.trim()
          : templateGroupStableId;
      if (!groupKey) continue;
      const choices = Array.isArray(group.choices) ? group.choices : [];
      const stableIds = choices.flatMap((rawChoice) => {
        if (
          !rawChoice ||
          typeof rawChoice !== 'object' ||
          Array.isArray(rawChoice)
        ) {
          return [];
        }
        const stableId = (rawChoice as Record<string, unknown>).stableId;
        return typeof stableId === 'string' && stableId.trim()
          ? [stableId.trim()]
          : [];
      });
      if (stableIds.length === 1) selections[groupKey] = stableIds[0];
      else if (stableIds.length > 1) selections[groupKey] = stableIds;
    }
    return Object.keys(selections).length > 0 ? selections : undefined;
  }

  private collectOptionSelectionRefs(
    options?: Record<string, unknown>,
  ): SelectedOptionRef[] {
    if (!options || typeof options !== 'object') return [];
    const refs: SelectedOptionRef[] = [];
    const seen = new Set<string>();
    let sequence = 0;
    const pushOptionId = (value: unknown, groupKey?: string) => {
      let optionId: string | null = null;
      if (typeof value === 'string') {
        optionId = value.trim();
      } else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const byId = record.id;
        const byStableId = record.optionStableId;
        if (typeof byId === 'string' && byId.trim()) optionId = byId.trim();
        else if (typeof byStableId === 'string' && byStableId.trim()) {
          optionId = byStableId.trim();
        }
      }
      if (!optionId) return;
      const key = `${groupKey ?? ''}::${optionId}`;
      if (seen.has(key)) return;
      seen.add(key);
      refs.push({ optionId, groupKey, sequence: sequence++ });
    };
    for (const [groupKey, value] of Object.entries(options)) {
      if (groupKey === 'notes') continue;
      if (Array.isArray(value))
        value.forEach((entry) => pushOptionId(entry, groupKey));
      else pushOptionId(value, groupKey);
    }
    return refs;
  }
}
