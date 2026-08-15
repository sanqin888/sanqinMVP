import type { UberMenuUploadPayload } from './uber-menu.types';
import {
  canonicalizeUberMenuPayload,
  UberMenuPublishSafetyService,
} from './uber-menu-publish-safety.service';

const payload = (price = 1099): UberMenuUploadPayload => ({
  menus: [
    {
      id: 'menu',
      title: { translations: { en_us: 'Menu' } },
      category_ids: ['category-b', 'category-a'],
      service_availability: [],
    },
  ],
  categories: [
    {
      id: 'category-a',
      title: { translations: { en_us: 'A' } },
      entities: [{ id: 'sanq:item:pork', type: 'ITEM' }],
    },
  ],
  items: [
    {
      id: 'sanq:item:pork',
      title: { translations: { en_us: 'Pork Roujiamo' } },
      price_info: { price, overrides: [] },
      tax_info: { tax_rate: 0, vat_rate_percentage: null },
      modifier_group_ids: { ids: ['group-b', 'group-a'], overrides: [] },
      suspension_info: null,
    },
  ],
  modifier_groups: [],
});

describe('UberMenuPublishSafetyService', () => {
  const service = new UberMenuPublishSafetyService();
  const evaluate = (
    currentPrice: number,
    source: 'UBER_OVERRIDE' | 'SANQ_SOURCE',
    intentional = false,
  ) =>
    service.evaluate({
      previous: payload(),
      current: payload(currentPrice),
      priceSources: new Map([
        [
          'pork',
          {
            sourcePriceCents: 999,
            overridePriceCents:
              source === 'UBER_OVERRIDE' ? currentPrice : null,
            valueSource: source,
          },
        ],
      ]),
      intentionalRestoreItemIds: new Set(intentional ? ['pork'] : []),
    });

  it('does not warn when the published override remains unchanged', () => {
    expect(evaluate(1099, 'UBER_OVERRIDE').risks).toEqual([]);
  });

  it('treats an explicit override change as a normal semantic change', () => {
    const result = evaluate(1199, 'UBER_OVERRIDE');
    expect(result.semanticallyChanged).toBe(true);
    expect(result.criticalCount).toBe(0);
  });

  it('classifies an unexpected override fallback as critical', () => {
    expect(evaluate(999, 'SANQ_SOURCE').risks).toContainEqual(
      expect.objectContaining({
        code: 'PUBLISHED_OVERRIDE_FALLBACK',
        severity: 'CRITICAL',
        previousValue: 1099,
        currentValue: 999,
      }),
    );
  });

  it('distinguishes an intentional restore from accidental fallback', () => {
    expect(evaluate(999, 'SANQ_SOURCE', true).risks).toContainEqual(
      expect.objectContaining({ severity: 'INFO', intentional: true }),
    );
  });

  it('canonicalizes reordered entity and reference arrays', () => {
    const left = payload();
    const right = payload();
    right.menus[0].category_ids.reverse();
    right.items[0].modifier_group_ids.ids?.reverse();
    expect(canonicalizeUberMenuPayload(left)).toEqual(
      canonicalizeUberMenuPayload(right),
    );
    const common = {
      previous: null,
      priceSources: new Map(),
      intentionalRestoreItemIds: new Set<string>(),
    };
    expect(service.evaluate({ ...common, current: left }).fingerprint).toBe(
      service.evaluate({ ...common, current: right }).fingerprint,
    );
  });

  it('changes the safety fingerprint when the outgoing payload changes', () => {
    const common = {
      previous: null,
      priceSources: new Map(),
      intentionalRestoreItemIds: new Set<string>(),
    };
    expect(
      service.evaluate({ ...common, current: payload(1099) }).fingerprint,
    ).not.toBe(
      service.evaluate({ ...common, current: payload(1199) }).fingerprint,
    );
  });
});
