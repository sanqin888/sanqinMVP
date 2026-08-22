import type { UberMenuUploadPayload } from './uber-menu.types';
import { buildUberNodeId } from './uber-menu-graph.service';
import {
  canonicalizeUberMenuPayload,
  UberMenuPublishSafetyService,
} from './uber-menu-publish-safety.service';

const STORE_ID = 'store-1';
const ITEM_STABLE_ID = 'pork';
const UBER_ITEM_ID = buildUberNodeId('item', STORE_ID, ITEM_STABLE_ID);
const OPTION_STABLE_ID = 'extra-cheese';
const UBER_OPTION_ID = buildUberNodeId('item', STORE_ID, OPTION_STABLE_ID);

const payload = (price = 1099): UberMenuUploadPayload => ({
  display_options: { disable_item_instructions: false },
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
      entities: [{ id: UBER_ITEM_ID, type: 'ITEM' }],
    },
  ],
  items: [
    {
      id: UBER_ITEM_ID,
      title: { translations: { en_us: 'Pork Roujiamo' } },
      price_info: { price, overrides: [] },
      tax_info: { tax_rate: 0, vat_rate_percentage: null },
      modifier_group_ids: { ids: ['group-b', 'group-a'], overrides: [] },
      suspension_info: null,
    },
  ],
  modifier_groups: [],
});

const optionPayload = (priceDeltaCents: number) => {
  const result = payload(priceDeltaCents);
  result.categories[0].entities[0].id = UBER_OPTION_ID;
  result.items[0].id = UBER_OPTION_ID;
  return result;
};

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
      priceSourcesByUberItemId: new Map([
        [
          UBER_ITEM_ID,
          {
            stableId: ITEM_STABLE_ID,
            entityType: 'ITEM',
            field: 'price',
            sourcePriceCents: 999,
            overridePriceCents:
              source === 'UBER_OVERRIDE' ? currentPrice : null,
            valueSource: source,
          },
        ],
      ]),
      intentionalRestoreItemIds: new Set(intentional ? [ITEM_STABLE_ID] : []),
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

  it('detects 849 to 749 fallback with the real hashed Uber item id', () => {
    expect(UBER_ITEM_ID).toMatch(/^sanq:[a-f0-9]{24}$/);
    const result = service.evaluate({
      previous: payload(849),
      current: payload(749),
      priceSourcesByUberItemId: new Map([
        [
          UBER_ITEM_ID,
          {
            stableId: ITEM_STABLE_ID,
            entityType: 'ITEM',
            field: 'price',
            sourcePriceCents: 749,
            overridePriceCents: null,
            valueSource: 'SANQ_SOURCE',
          },
        ],
      ]),
      intentionalRestoreItemIds: new Set(),
    });
    expect(result.risks).toContainEqual(
      expect.objectContaining({
        code: 'PUBLISHED_OVERRIDE_FALLBACK',
        severity: 'CRITICAL',
        entityId: ITEM_STABLE_ID,
        previousValue: 849,
        currentValue: 749,
      }),
    );
  });

  it('detects a published option override falling back to the SanQ delta', () => {
    expect(UBER_OPTION_ID).toMatch(/^sanq:[a-f0-9]{24}$/);
    const result = service.evaluate({
      previous: optionPayload(150),
      current: optionPayload(50),
      priceSourcesByUberItemId: new Map([
        [
          UBER_OPTION_ID,
          {
            stableId: OPTION_STABLE_ID,
            entityType: 'OPTION_ITEM',
            field: 'priceDelta',
            sourcePriceCents: 50,
            overridePriceCents: null,
            valueSource: 'SANQ_SOURCE',
          },
        ],
      ]),
      intentionalRestoreItemIds: new Set(),
    });
    expect(result.risks).toContainEqual(
      expect.objectContaining({
        severity: 'CRITICAL',
        code: 'PUBLISHED_OVERRIDE_FALLBACK',
        entityType: 'OPTION_ITEM',
        entityId: OPTION_STABLE_ID,
        field: 'priceDelta',
        previousValue: 150,
        currentValue: 50,
        sourceValue: 50,
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
      priceSourcesByUberItemId: new Map(),
      intentionalRestoreItemIds: new Set<string>(),
    };
    expect(service.evaluate({ ...common, current: left }).fingerprint).toBe(
      service.evaluate({ ...common, current: right }).fingerprint,
    );
  });

  it('changes the safety fingerprint when the outgoing payload changes', () => {
    const common = {
      previous: null,
      priceSourcesByUberItemId: new Map(),
      intentionalRestoreItemIds: new Set<string>(),
    };
    expect(
      service.evaluate({ ...common, current: payload(1099) }).fingerprint,
    ).not.toBe(
      service.evaluate({ ...common, current: payload(1199) }).fingerprint,
    );
  });
});
