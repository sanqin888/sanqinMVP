import { FulfillmentType } from '@prisma/client';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  OrderItemOptionChoiceSnapshot,
  OrderItemOptionGroupSnapshot,
  OrderItemOptionsSnapshot,
} from './order-item-options';

type LabelStrategy = 'AUTO' | 'ALWAYS' | 'NEVER';

type LabelOption = {
  stableId: string;
  nameZh: string | null;
  nameEn: string | null;
  displayName: string | null;
};

export type OrderFoodLabelDto = {
  productStableId: string;
  pairCode: string | null;
  component: string;
  componentNameZh: string | null;
  componentNameEn: string | null;
  packagingTypeStableId: string;
  packagingTypeName: string;
  nameZh: string | null;
  nameEn: string | null;
  options: LabelOption[];
  specialInstructions: string | null;
  copies: number;
};

export type OrderLabelPlanDto = {
  labelWidthMm: 70;
  labelHeightMm: 30;
  labels: OrderFoodLabelDto[];
};

type MenuItemConfig = {
  stableId: string;
  nameEn: string;
  nameZh: string | null;
  labelStrategy: LabelStrategy;
  packagings: Array<{
    id: string;
    sortOrder: number;
    packagingType: {
      stableId: string;
      name: string;
    };
  }>;
  optionGroups: Array<{
    affectedPackagingTypeStableIds: string[];
    templateGroup: { stableId: string };
  }>;
};

type FulfillmentItem = {
  instanceId: string;
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  options: OrderItemOptionGroupSnapshot[];
  specialInstructions: string | null;
  config: MenuItemConfig;
};

type PackagingComponent = {
  instanceId: string;
  pairIdentity: string;
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  componentKey: string;
  componentNameZh: string | null;
  componentNameEn: string | null;
  packagingTypeStableId: string;
  packagingTypeName: string;
  variantKey: string;
  fullItemVariantKey: string;
  options: LabelOption[];
  specialInstructions: string | null;
  strategy: LabelStrategy;
  shouldPrint: boolean;
  pairCode: string | null;
};

type PhysicalPackagingGroup = {
  components: PackagingComponent[];
  distinctVariants: Set<string>;
  distinctProducts: Set<string>;
  distinctPairIdentities: Set<string>;
};

const EMPTY_PLAN: OrderLabelPlanDto = {
  labelWidthMm: 70,
  labelHeightMm: 30,
  labels: [],
};

@Injectable()
export class OrderLabelPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async getByStableId(orderStableId: string): Promise<OrderLabelPlanDto> {
    const stableId = orderStableId.trim();
    const order = await this.prisma.order.findUnique({
      where: { orderStableId: stableId },
      select: {
        fulfillmentType: true,
        items: {
          select: {
            productStableId: true,
            qty: true,
            nameEn: true,
            nameZh: true,
            displayName: true,
            optionsJson: true,
            externalSpecialInstructions: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('order not found');
    if (order.fulfillmentType === FulfillmentType.dine_in) return EMPTY_PLAN;

    const resolved = this.resolveFulfillmentSeeds(order.items);
    if (resolved.length === 0) return EMPTY_PLAN;

    const productStableIds = [
      ...new Set(resolved.map((item) => item.productStableId)),
    ];
    const configs = await this.prisma.menuItem.findMany({
      where: {
        stableId: { in: productStableIds },
        deletedAt: null,
      },
      select: {
        stableId: true,
        nameEn: true,
        nameZh: true,
        labelStrategy: true,
        packagings: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            sortOrder: true,
            packagingType: {
              select: { stableId: true, name: true },
            },
          },
        },
        optionGroups: {
          where: { isEnabled: true },
          select: {
            affectedPackagingTypeStableIds: true,
            templateGroup: { select: { stableId: true } },
          },
        },
      },
    });
    const configByStableId = new Map(
      configs.map((config) => [config.stableId, config as MenuItemConfig]),
    );

    const fulfillmentItems: FulfillmentItem[] = [];
    for (const seed of resolved) {
      const config = configByStableId.get(seed.productStableId);
      if (!config) continue;
      fulfillmentItems.push({
        ...seed,
        nameEn: config.nameEn ?? seed.nameEn,
        nameZh: config.nameZh ?? seed.nameZh,
        config,
      });
    }
    if (fulfillmentItems.length === 0) return EMPTY_PLAN;

    const components = fulfillmentItems.flatMap((item) =>
      this.expandPackagingComponents(item),
    );
    if (components.length === 0) return EMPTY_PLAN;

    const physicalGroups = this.markAmbiguousPhysicalPackages(components);
    const pairingIdentities = this.resolvePairingAndPropagation(
      components,
      physicalGroups,
    );
    this.assignPairCodes(components, pairingIdentities);

    return {
      labelWidthMm: 70,
      labelHeightMm: 30,
      labels: this.collapseLabels(
        components.filter((component) => component.shouldPrint),
      ),
    };
  }

  private resolveFulfillmentSeeds(
    orderItems: Array<{
      productStableId: string;
      qty: number;
      nameEn: string | null;
      nameZh: string | null;
      displayName: string | null;
      optionsJson: unknown;
      externalSpecialInstructions: string | null;
    }>,
  ): Array<Omit<FulfillmentItem, 'config'>> {
    const output: Array<Omit<FulfillmentItem, 'config'>> = [];

    orderItems.forEach((orderItem, lineIndex) => {
      const options = this.readOptions(orderItem.optionsJson);
      const targets = options.flatMap((group) =>
        group.choices
          .filter((choice) => Boolean(choice.targetItemStableId?.trim()))
          .map((choice) => ({ group, choice })),
      );
      const quantity = Math.max(1, Math.round(orderItem.qty || 1));

      for (
        let quantityIndex = 0;
        quantityIndex < quantity;
        quantityIndex += 1
      ) {
        if (targets.length === 0) {
          output.push({
            instanceId: `${lineIndex}:${quantityIndex}:direct`,
            productStableId: orderItem.productStableId,
            nameEn: orderItem.nameEn ?? orderItem.displayName,
            nameZh: orderItem.nameZh,
            options,
            specialInstructions:
              orderItem.externalSpecialInstructions?.trim() || null,
          });
          continue;
        }

        targets.forEach(({ choice }, targetIndex) => {
          const targetItemStableId = choice.targetItemStableId?.trim();
          if (!targetItemStableId) return;
          const nestedOptions = options.filter((group) =>
            this.groupBelongsToTarget(group, choice.stableId),
          );
          output.push({
            instanceId: `${lineIndex}:${quantityIndex}:target:${targetIndex}`,
            productStableId: targetItemStableId,
            nameEn: choice.nameEn ?? choice.displayName ?? null,
            nameZh: choice.nameZh ?? null,
            options: nestedOptions,
            specialInstructions:
              orderItem.externalSpecialInstructions?.trim() || null,
          });
        });
      }
    });

    return output;
  }

  private groupBelongsToTarget(
    group: OrderItemOptionGroupSnapshot,
    targetChoiceStableId: string,
  ): boolean {
    const groupKey = group.groupKey?.trim();
    if (!groupKey) return false;
    return groupKey
      .split('__')
      .some((segment) => segment === `option-${targetChoiceStableId}`);
  }

  private expandPackagingComponents(
    item: FulfillmentItem,
  ): PackagingComponent[] {
    const packagings =
      item.config.packagings.length > 0
        ? item.config.packagings
        : item.config.labelStrategy === 'ALWAYS'
          ? [
              {
                id: `unconfigured:${item.productStableId}`,
                sortOrder: 0,
                packagingType: {
                  stableId: `unconfigured:${item.productStableId}`,
                  name: 'Unconfigured',
                },
              },
            ]
          : [];
    if (packagings.length === 0) return [];

    const affectedPackagingTypesByTemplate = new Map(
      item.config.optionGroups.map((binding) => [
        binding.templateGroup.stableId,
        binding.affectedPackagingTypeStableIds,
      ]),
    );
    const allChoices = item.options.flatMap((group) => group.choices);
    const fullItemVariantKey = this.variantKey(
      item.productStableId,
      allChoices,
      item.specialInstructions,
    );
    const pairIdentity = `${item.productStableId}|${fullItemVariantKey}`;

    return packagings.map((packaging) => {
      const applicableChoices = item.options.flatMap((group) => {
        const affectedPackagingTypeStableIds =
          affectedPackagingTypesByTemplate.get(group.templateGroupStableId) ??
          [];
        return affectedPackagingTypeStableIds.length === 0 ||
          affectedPackagingTypeStableIds.includes(
            packaging.packagingType.stableId,
          )
          ? group.choices
          : [];
      });

      return {
        instanceId: `${item.instanceId}:${packaging.id}`,
        pairIdentity,
        productStableId: item.productStableId,
        nameEn: item.nameEn,
        nameZh: item.nameZh,
        componentKey: packaging.packagingType.stableId,
        componentNameZh: null,
        componentNameEn: null,
        packagingTypeStableId: packaging.packagingType.stableId,
        packagingTypeName: packaging.packagingType.name,
        variantKey: this.variantKey(
          item.productStableId,
          applicableChoices,
          item.specialInstructions,
        ),
        fullItemVariantKey,
        options: applicableChoices.map((choice) => this.toLabelOption(choice)),
        specialInstructions: item.specialInstructions,
        strategy: item.config.labelStrategy,
        shouldPrint: item.config.labelStrategy === 'ALWAYS',
        pairCode: null,
      };
    });
  }

  private markAmbiguousPhysicalPackages(
    components: PackagingComponent[],
  ): Map<string, PhysicalPackagingGroup> {
    const groups = this.buildPhysicalPackagingGroups(components);
    for (const group of groups.values()) {
      if (group.distinctVariants.size < 2) continue;
      for (const component of group.components) {
        if (component.strategy === 'AUTO') component.shouldPrint = true;
      }
    }
    for (const component of components) {
      if (component.strategy === 'NEVER') component.shouldPrint = false;
    }
    return groups;
  }

  private resolvePairingAndPropagation(
    components: PackagingComponent[],
    physicalGroups: Map<string, PhysicalPackagingGroup>,
  ): Set<string> {
    const pairingIdentities = new Set<string>();
    const componentsByIdentity = new Map<string, PackagingComponent[]>();
    for (const component of components) {
      const current = componentsByIdentity.get(component.pairIdentity) ?? [];
      current.push(component);
      componentsByIdentity.set(component.pairIdentity, current);
    }

    // Different products in the same physical package are a real packaging
    // collision. If at least one competing item uses multiple package
    // components, print those companion packages too and use a pairing code.
    for (const group of physicalGroups.values()) {
      if (group.distinctVariants.size < 2 || group.distinctProducts.size < 2) {
        continue;
      }
      const identities = [...group.distinctPairIdentities];
      const hasMultiPackageIdentity = identities.some((identity) => {
        const identityComponents = componentsByIdentity.get(identity) ?? [];
        return (
          new Set(
            identityComponents.map(
              (component) => component.packagingTypeStableId,
            ),
          ).size > 1
        );
      });
      if (!hasMultiPackageIdentity) continue;

      identities.forEach((identity) => pairingIdentities.add(identity));
      for (const identity of identities) {
        for (const component of componentsByIdentity.get(identity) ?? []) {
          if (component.strategy !== 'NEVER') component.shouldPrint = true;
        }
      }
    }

    // For variants of the same product, a pairing code is only needed when
    // two or more different physical package types vary. Example: spice only
    // changes the noodle bowl, so the identical soup bowls stay unlabeled.
    const ambiguousPackageTypesByProduct = new Map<string, Set<string>>();
    const ambiguousIdentitiesByProduct = new Map<string, Set<string>>();
    for (const [packagingTypeStableId, group] of physicalGroups.entries()) {
      if (
        group.distinctVariants.size < 2 ||
        group.distinctProducts.size !== 1
      ) {
        continue;
      }
      const productStableId = group.components[0]?.productStableId;
      if (!productStableId) continue;
      const identities = new Set(
        group.components.map((component) => component.pairIdentity),
      );
      if (identities.size < 2) continue;
      const packageTypes =
        ambiguousPackageTypesByProduct.get(productStableId) ??
        new Set<string>();
      packageTypes.add(packagingTypeStableId);
      ambiguousPackageTypesByProduct.set(productStableId, packageTypes);
      const productIdentities =
        ambiguousIdentitiesByProduct.get(productStableId) ??
        new Set<string>();
      identities.forEach((identity) => productIdentities.add(identity));
      ambiguousIdentitiesByProduct.set(productStableId, productIdentities);
    }

    for (const [
      productStableId,
      packageTypes,
    ] of ambiguousPackageTypesByProduct) {
      if (packageTypes.size < 2) continue;
      const identities =
        ambiguousIdentitiesByProduct.get(productStableId) ?? new Set();
      identities.forEach((identity) => pairingIdentities.add(identity));
      for (const identity of identities) {
        for (const component of componentsByIdentity.get(identity) ?? []) {
          if (component.strategy !== 'NEVER') component.shouldPrint = true;
        }
      }
    }

    return pairingIdentities;
  }

  private assignPairCodes(
    components: PackagingComponent[],
    pairingIdentities: Set<string>,
  ): void {
    if (pairingIdentities.size < 2) return;
    const orderedIdentities: string[] = [];
    for (const component of components) {
      if (
        pairingIdentities.has(component.pairIdentity) &&
        !orderedIdentities.includes(component.pairIdentity)
      ) {
        orderedIdentities.push(component.pairIdentity);
      }
    }
    const codeByIdentity = new Map(
      orderedIdentities.map((identity, index) => [
        identity,
        this.pairCode(index),
      ]),
    );
    for (const component of components) {
      if (!component.shouldPrint) continue;
      component.pairCode = codeByIdentity.get(component.pairIdentity) ?? null;
    }
  }

  private buildPhysicalPackagingGroups(
    components: PackagingComponent[],
  ): Map<string, PhysicalPackagingGroup> {
    const groups = new Map<string, PhysicalPackagingGroup>();
    for (const component of components) {
      const key = component.packagingTypeStableId;
      const group = groups.get(key) ?? {
        components: [],
        distinctVariants: new Set<string>(),
        distinctProducts: new Set<string>(),
        distinctPairIdentities: new Set<string>(),
      };
      group.components.push(component);
      group.distinctVariants.add(component.variantKey);
      group.distinctProducts.add(component.productStableId);
      group.distinctPairIdentities.add(component.pairIdentity);
      groups.set(key, group);
    }
    return groups;
  }

  private collapseLabels(
    components: PackagingComponent[],
  ): OrderFoodLabelDto[] {
    const grouped = new Map<string, OrderFoodLabelDto>();
    for (const component of components) {
      const key = JSON.stringify({
        productStableId: component.productStableId,
        pairCode: component.pairCode,
        componentKey: component.componentKey,
        packagingTypeStableId: component.packagingTypeStableId,
        options: component.options.map((option) => option.stableId),
        specialInstructions: component.specialInstructions,
      });
      const existing = grouped.get(key);
      if (existing) {
        existing.copies += 1;
        continue;
      }
      grouped.set(key, {
        productStableId: component.productStableId,
        pairCode: component.pairCode,
        component: component.componentKey,
        componentNameZh: component.componentNameZh,
        componentNameEn: component.componentNameEn,
        packagingTypeStableId: component.packagingTypeStableId,
        packagingTypeName: component.packagingTypeName,
        nameZh: component.nameZh,
        nameEn: component.nameEn,
        options: component.options,
        specialInstructions: component.specialInstructions,
        copies: 1,
      });
    }
    return [...grouped.values()];
  }

  private variantKey(
    productStableId: string,
    choices: OrderItemOptionChoiceSnapshot[],
    specialInstructions: string | null,
  ): string {
    const optionIds = choices
      .map((choice) => choice.stableId)
      .filter(Boolean)
      .sort();
    return JSON.stringify({
      productStableId,
      optionIds,
      specialInstructions: specialInstructions?.trim() || null,
    });
  }

  private toLabelOption(choice: OrderItemOptionChoiceSnapshot): LabelOption {
    return {
      stableId: choice.stableId,
      nameZh: choice.nameZh ?? null,
      nameEn: choice.nameEn ?? null,
      displayName: choice.displayName ?? null,
    };
  }

  private readOptions(value: unknown): OrderItemOptionsSnapshot {
    if (!Array.isArray(value)) return [];
    return value.filter((group): group is OrderItemOptionGroupSnapshot =>
      Boolean(
        group &&
          typeof group === 'object' &&
          typeof (group as { templateGroupStableId?: unknown })
            .templateGroupStableId === 'string' &&
          Array.isArray((group as { choices?: unknown }).choices),
      ),
    );
  }

  private pairCode(index: number): string {
    let value = index + 1;
    let result = '';
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }
}
