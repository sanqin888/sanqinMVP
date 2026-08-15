import { createHash } from 'crypto';
import type {
  UberMenuPublishRisk,
  UberMenuUploadPayload,
  UberValueSource,
} from './uber-menu.types';

type PriceSource = {
  sourcePriceCents: number;
  overridePriceCents: number | null;
  valueSource: UberValueSource;
};

const byId = <T extends { id: string }>(values: T[]) =>
  [...values].sort((left, right) => left.id.localeCompare(right.id));

/** Canonical form used for semantic comparisons; all reference arrays are sets. */
export function canonicalizeUberMenuPayload(payload: UberMenuUploadPayload) {
  return {
    menus: byId(payload.menus).map((menu) => ({
      ...menu,
      category_ids: [...menu.category_ids].sort(),
      service_availability: [...menu.service_availability]
        .map((entry) => ({
          ...entry,
          time_periods: [...entry.time_periods].sort((a, b) =>
            `${a.start_time}-${a.end_time}`.localeCompare(
              `${b.start_time}-${b.end_time}`,
            ),
          ),
        }))
        .sort((a, b) => a.day_of_week.localeCompare(b.day_of_week)),
    })),
    categories: byId(payload.categories).map((category) => ({
      ...category,
      entities: byId(category.entities),
    })),
    items: byId(payload.items).map((item) => ({
      ...item,
      modifier_group_ids: {
        ...item.modifier_group_ids,
        ids: item.modifier_group_ids.ids
          ? [...item.modifier_group_ids.ids].sort()
          : null,
      },
    })),
    modifier_groups: byId(payload.modifier_groups).map((group) => ({
      ...group,
      modifier_options: byId(group.modifier_options),
    })),
  };
}

export class UberMenuPublishSafetyService {
  evaluate(input: {
    previous: UberMenuUploadPayload | null;
    current: UberMenuUploadPayload;
    priceSources: ReadonlyMap<string, PriceSource>;
    intentionalRestoreItemIds: ReadonlySet<string>;
  }) {
    const previous = input.previous
      ? canonicalizeUberMenuPayload(input.previous)
      : null;
    const current = canonicalizeUberMenuPayload(input.current);
    const risks: UberMenuPublishRisk[] = [];
    const fingerprint = () =>
      createHash('sha256')
        .update(JSON.stringify({ current, risks }))
        .digest('hex');
    if (!previous)
      return {
        semanticallyChanged: true,
        risks,
        criticalCount: 0,
        fingerprint: fingerprint(),
      };

    const currentItems = new Map(current.items.map((item) => [item.id, item]));
    for (const item of previous.items) {
      const next = currentItems.get(item.id);
      if (!next) {
        risks.push({
          severity: 'CRITICAL',
          code: 'RESOURCE_DELETED',
          entityType: 'ITEM',
          entityId: item.id,
          field: 'resource',
          previousValue: 'PRESENT',
          currentValue: 'MISSING',
        });
        continue;
      }
      const stableId = item.id.replace(/^sanq:item:/, '');
      const source = input.priceSources.get(stableId);
      const previousPrice = item.price_info.price;
      const currentPrice = next.price_info.price;
      if (
        previousPrice !== currentPrice &&
        source?.valueSource === 'SANQ_SOURCE' &&
        source.overridePriceCents === null &&
        currentPrice === source.sourcePriceCents
      ) {
        const intentional = input.intentionalRestoreItemIds.has(stableId);
        risks.push({
          severity: intentional ? 'INFO' : 'CRITICAL',
          code: 'PUBLISHED_OVERRIDE_FALLBACK',
          entityType: 'ITEM',
          entityId: stableId,
          field: 'price',
          previousValue: previousPrice,
          currentValue: currentPrice,
          sourceValue: source.sourcePriceCents,
          intentional,
        });
      }
    }
    const fallbackCount = risks.filter(
      (risk) =>
        risk.code === 'PUBLISHED_OVERRIDE_FALLBACK' && !risk.intentional,
    ).length;
    if (fallbackCount >= Math.max(5, Math.ceil(previous.items.length * 0.2))) {
      risks.push({
        severity: 'CRITICAL',
        code: 'MASS_CONFIGURATION_LOSS',
        entityType: 'ITEM',
        entityId: '*',
        field: 'price',
        previousValue: fallbackCount,
        currentValue: fallbackCount,
      });
    }
    return {
      semanticallyChanged: JSON.stringify(previous) !== JSON.stringify(current),
      risks,
      criticalCount: risks.filter((risk) => risk.severity === 'CRITICAL')
        .length,
      fingerprint: fingerprint(),
    };
  }
}
