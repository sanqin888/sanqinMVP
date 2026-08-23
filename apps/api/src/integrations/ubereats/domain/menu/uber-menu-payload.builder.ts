import type {
  UberMenuUploadPayload,
  UberPreparationType,
} from './uber-menu.types';
import {
  isPermanentPublicHttpsUrl,
  UBER_IMAGE_URL_MAX_LENGTH,
} from './uber-menu.types';
import {
  resolveUberImageUrl,
  UBER_ITEM_DESCRIPTION_MAX_LENGTH,
  type UberMenuPayloadValidationIssue,
  type UberImageUrlResolutionContext,
  type UberServiceAvailability,
} from './uber-payload.utils';

const INDEFINITE_SUSPEND_UNTIL = Math.floor(Date.UTC(2099, 0, 1) / 1_000);

/** Combines the bilingual source names without introducing empty whitespace. */
export function composeUberDisplayName(
  nameEn?: string | null,
  nameZh?: string | null,
): string {
  const en = (nameEn ?? '').trim();
  const zh = (nameZh ?? '').trim();
  if (en && zh) return `${en} ${zh}`;
  return en || zh;
}

export interface UberUploadMenuGraph {
  menuId: string;
  categories: Array<{ id: string; title: string; entities: string[] }>;
  items: Array<{
    id: string;
    sourceType: 'MENU_ITEM' | 'OPTION_ITEM';
    sourceStableId: string;
    title: string;
    description: string | null;
    priceCents: number;
    isAvailable: boolean;
    preparationType: UberPreparationType | null;
    modifierGroupIds: string[];
    imageUrl: string | null;
  }>;
  groups: Array<{
    id: string;
    title: string;
    minSelect: number;
    maxSelect: number;
    optionItemIds: string[];
  }>;
}

/** Converts an already-resolved menu graph into Uber's wire representation. */
export function buildUberUploadMenuPayload(
  graph: UberUploadMenuGraph,
  serviceAvailability: UberServiceAvailability[],
  taxRatePercentage: number,
  urlContext: UberImageUrlResolutionContext,
): UberMenuUploadPayload {
  return {
    display_options: { disable_item_instructions: false },
    menus: [
      {
        id: graph.menuId,
        title: { translations: { en_us: 'Main Menu' } },
        category_ids: graph.categories.map(({ id }) => id),
        service_availability: serviceAvailability,
      },
    ],
    categories: graph.categories.map((category) => ({
      id: category.id,
      title: { translations: { en_us: category.title } },
      entities: category.entities.map((id) => ({ id, type: 'ITEM' as const })),
    })),
    items: graph.items.map((item) => {
      const imageUrl = resolveUberImageUrl(item.imageUrl, urlContext);
      return {
        id: item.id,
        title: { translations: { en_us: item.title || item.sourceStableId } },
        ...(item.description
          ? { description: { translations: { en_us: item.description } } }
          : {}),
        price_info: { price: item.priceCents, overrides: [] },
        tax_info: { tax_rate: taxRatePercentage, vat_rate_percentage: null },
        dish_info: {
          classifications: {
            preparation_type:
              item.preparationType === 'PREPACKAGED'
                ? ('PREPACKAGED' as const)
                : ('' as const),
          },
        },
        modifier_group_ids: {
          ids:
            item.sourceType === 'OPTION_ITEM' || !item.modifierGroupIds.length
              ? null
              : item.modifierGroupIds,
          overrides: [],
        },
        suspension_info: item.isAvailable
          ? null
          : {
              suspension: {
                suspend_until: INDEFINITE_SUSPEND_UNTIL,
                reason: 'Item unavailable',
              },
            },
        ...(item.sourceType === 'MENU_ITEM' && imageUrl
          ? { image_url: imageUrl }
          : {}),
      };
    }),
    modifier_groups: graph.groups.map((group) => ({
      id: group.id,
      title: { translations: { en_us: group.title } },
      quantity_info: {
        quantity: {
          min_permitted: group.minSelect,
          max_permitted: group.maxSelect,
        },
      },
      modifier_options: group.optionItemIds.map((id) => ({
        type: 'ITEM' as const,
        id,
      })),
    })),
  };
}

/** Pure cartesian-product helper used by nested modifier flattening. */
export function flattenUberModifierCombinations<T>(
  groups: readonly (readonly T[])[],
): T[][] {
  return groups.reduce<T[][]>(
    (combinations, group) =>
      combinations.flatMap((prefix) =>
        group.map((value) => [...prefix, value]),
      ),
    [[]],
  );
}

/** Validates and normalizes the final wire payload without performing I/O. */
export function validateUberMenuPayload(
  payload: UberMenuUploadPayload,
): UberMenuPayloadValidationIssue[] {
  const issues: UberMenuPayloadValidationIssue[] = [];
  const add = (
    code: string,
    severity: 'ERROR' | 'WARNING',
    path: string,
    sourceStableId: string | null,
    message: string,
  ) => issues.push({ code, severity, path, sourceStableId, message });
  if (payload.display_options?.disable_item_instructions !== false)
    add(
      'UBER_ITEM_INSTRUCTIONS_SUPPORT_FLAG_INVALID',
      'ERROR',
      '$.display_options.disable_item_instructions',
      null,
      'SanQ 支持 Uber item-level special instructions，因此 disable_item_instructions 必须为 false。',
    );
  const ids = new Map<string, string>();
  type TitledUberNode = {
    id: string;
    title: { translations: { en_us: string } };
  };
  const collections: readonly (readonly [string, readonly TitledUberNode[]])[] =
    [
      ['menus', payload.menus],
      ['categories', payload.categories],
      ['items', payload.items],
      ['modifier_groups', payload.modifier_groups],
    ];
  for (const [name, nodes] of collections)
    nodes.forEach((node, index) => {
      const path = `$.${name}[${index}]`;
      if (!node.id || ids.has(node.id))
        add(
          'UBER_ID_NOT_GLOBALLY_UNIQUE',
          'ERROR',
          `${path}.id`,
          node.id || null,
          node.id ? `ID“${node.id}”在顶层实体中重复。` : '实体 ID 不能为空。',
        );
      else ids.set(node.id, path);
      const title = node.title?.translations?.en_us;
      if (typeof title !== 'string' || !title.trim() || title.length > 300)
        add(
          'UBER_TITLE_INVALID',
          'ERROR',
          `${path}.title.translations.en_us`,
          node.id || null,
          '标题不能为空且长度不得超过 300 个字符。',
        );
    });
  const categoryIds = new Set(payload.categories.map(({ id }) => id));
  const itemIds = new Set(payload.items.map(({ id }) => id));
  const groupIds = new Set(payload.modifier_groups.map(({ id }) => id));
  payload.menus.forEach((menu, mi) => {
    if (!menu.category_ids.length)
      add(
        'UBER_MENU_CATEGORY_EMPTY',
        'ERROR',
        `$.menus[${mi}].category_ids`,
        menu.id,
        '菜单至少需要一个分类。',
      );
    menu.category_ids.forEach((id, i) => {
      if (!categoryIds.has(id))
        add(
          'UBER_REFERENCE_UNRESOLVED',
          'ERROR',
          `$.menus[${mi}].category_ids[${i}]`,
          menu.id,
          `引用的分类“${id}”不存在。`,
        );
    });
  });
  payload.categories.forEach((category, ci) => {
    if (!category.entities.length)
      add(
        'UBER_CATEGORY_ITEM_EMPTY',
        'ERROR',
        `$.categories[${ci}].entities`,
        category.id,
        '分类至少需要一个菜品。',
      );
    category.entities.forEach((ref, ri) => {
      const path = `$.categories[${ci}].entities[${ri}]`;
      if (ref.type !== 'ITEM')
        add(
          'UBER_CATEGORY_ENTITY_TYPE_INVALID',
          'ERROR',
          `${path}.type`,
          category.id,
          '分类实体类型必须为 ITEM。',
        );
      if (!itemIds.has(ref.id))
        add(
          'UBER_REFERENCE_UNRESOLVED',
          'ERROR',
          `${path}.id`,
          category.id,
          `引用的菜品“${ref.id}”不存在。`,
        );
    });
  });
  payload.items.forEach((item, ii) => {
    if (item.description !== undefined) {
      const value = item.description.translations?.en_us;
      const path = `$.items[${ii}].description.translations.en_us`;
      if (typeof value !== 'string')
        add(
          'UBER_DESCRIPTION_INVALID',
          'ERROR',
          path,
          item.id,
          '描述必须是字符串。',
        );
      else {
        const cleaned = value.replace(/\s+/g, ' ').trim();
        if (!cleaned) {
          delete item.description;
          add(
            'UBER_DESCRIPTION_EMPTY_REMOVED',
            'WARNING',
            path,
            item.id,
            '空白描述已从发布 payload 中移除。',
          );
        } else if (cleaned.length > UBER_ITEM_DESCRIPTION_MAX_LENGTH) {
          item.description.translations.en_us = cleaned.slice(
            0,
            UBER_ITEM_DESCRIPTION_MAX_LENGTH,
          );
          add(
            'UBER_DESCRIPTION_TRUNCATED',
            'WARNING',
            path,
            item.id,
            `描述超过 Uber schema 的 ${UBER_ITEM_DESCRIPTION_MAX_LENGTH} 个字符限制，已清理并截断。`,
          );
        } else item.description.translations.en_us = cleaned;
      }
    }
    if (
      item.image_url !== undefined &&
      !isPermanentPublicHttpsUrl(item.image_url)
    )
      add(
        'UBER_IMAGE_URL_INVALID',
        'ERROR',
        `$.items[${ii}].image_url`,
        item.id,
        `图片地址必须是不超过 ${UBER_IMAGE_URL_MAX_LENGTH} 个字符、不含临时签名的永久公网 HTTPS URL。`,
      );
    if (!Number.isInteger(item.price_info?.price) || item.price_info.price < 0)
      add(
        'UBER_PRICE_INVALID',
        'ERROR',
        `$.items[${ii}].price_info.price`,
        item.id,
        '价格必须为非负整数（分）。',
      );
    if (
      !Number.isFinite(item.tax_info?.tax_rate) ||
      item.tax_info.tax_rate < 0 ||
      item.tax_info.tax_rate > 100
    )
      add(
        'UBER_TAX_RATE_INVALID',
        'ERROR',
        `$.items[${ii}].tax_info.tax_rate`,
        item.id,
        '税率必须使用 0～100 的百分数格式。',
      );
    const preparationType = item.dish_info?.classifications?.preparation_type;
    if (preparationType !== '' && preparationType !== 'PREPACKAGED')
      add(
        'UBER_PREPARATION_TYPE_INVALID',
        'ERROR',
        `$.items[${ii}].dish_info.classifications.preparation_type`,
        item.id,
        '加拿大 FOOD/BEVERAGE 菜品必须显式提供 preparation_type，且只能为 PREPACKAGED 或空字符串。',
      );
    (item.modifier_group_ids.ids ?? []).forEach((id, gi) => {
      if (!groupIds.has(id))
        add(
          'UBER_REFERENCE_UNRESOLVED',
          'ERROR',
          `$.items[${ii}].modifier_group_ids[${gi}]`,
          item.id,
          `引用的选项组“${id}”不存在。`,
        );
    });
  });
  const optionIds = new Set(
    payload.modifier_groups.flatMap((group) =>
      group.modifier_options.map(({ id }) => id),
    ),
  );
  payload.modifier_groups.forEach((group, gi) => {
    const { min_permitted: min, max_permitted: max } =
      group.quantity_info.quantity;
    if (min > 0 && group.modifier_options.length === 0)
      add(
        'UBER_REQUIRED_GROUP_EMPTY',
        'ERROR',
        `$.modifier_groups[${gi}].modifier_options`,
        group.id,
        '必选组选项不能为空。',
      );
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 0 ||
      min > max ||
      max > group.modifier_options.length
    )
      add(
        'UBER_GROUP_QUANTITY_INVALID',
        'ERROR',
        `$.modifier_groups[${gi}].quantity_info.quantity`,
        group.id,
        '组选取数量必须为整数，且满足 0 ≤ min ≤ max ≤ 可选项数量。',
      );
    group.modifier_options.forEach((ref, oi) => {
      const path = `$.modifier_groups[${gi}].modifier_options[${oi}]`;
      if (ref.type !== 'ITEM')
        add(
          'UBER_MODIFIER_OPTION_TYPE_INVALID',
          'ERROR',
          `${path}.type`,
          group.id,
          'Modifier option 类型必须为 ITEM。',
        );
      if (!itemIds.has(ref.id))
        add(
          'UBER_REFERENCE_UNRESOLVED',
          'ERROR',
          `${path}.id`,
          group.id,
          `引用的选项菜品“${ref.id}”不存在。`,
        );
    });
  });
  payload.items.forEach((item, ii) => {
    if (optionIds.has(item.id) && (item.modifier_group_ids.ids?.length ?? 0))
      add(
        'UBER_OPTION_ITEM_HAS_MODIFIER_GROUP',
        'ERROR',
        `$.items[${ii}].modifier_group_ids.ids`,
        item.id,
        'Option item 不得再引用 modifier group。',
      );
  });
  const availability = payload.menus.flatMap(
    (menu) => menu.service_availability ?? [],
  );
  if (
    !availability.length ||
    availability.every((day) => !day.time_periods.length)
  )
    add(
      'UBER_SERVICE_AVAILABILITY_EMPTY',
      'ERROR',
      '$.menus[0].service_availability',
      null,
      '发布前必须至少配置一个合法可售营业时段。',
    );
  availability.forEach((day, di) =>
    day.time_periods.forEach((period, pi) => {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (
        !day.day_of_week ||
        !time.test(period.start_time ?? '') ||
        !(time.test(period.end_time ?? '') || period.end_time === '24:00') ||
        period.start_time >= period.end_time
      )
        add(
          'UBER_SERVICE_AVAILABILITY_INVALID',
          'ERROR',
          `$.menus[0].service_availability[${di}].time_periods[${pi}]`,
          null,
          '营业时段必须包含星期，并使用有效且起始早于结束的 HH:mm 时间（当日终点可为 24:00）。',
        );
    }),
  );
  return issues;
}
