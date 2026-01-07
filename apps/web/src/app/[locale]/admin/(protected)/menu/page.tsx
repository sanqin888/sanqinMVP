//apps/web/src/app/[locale]/admin/(protected)/menu/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';
import type {
  AdminMenuCategoryDto,
  AdminMenuFullResponse,
  MenuItemWithBindingsDto,
  MenuTemplateLite,
} from '@shared/menu';

type SavingState = {
  itemStableId: string | null;
  error: string | null;
};

type AvailabilityTarget = {
  stableId: string;
  label: string;
};

type BindDraft = {
  templateGroupStableId: string;
  minSelect: string;
  maxSelect: string; // "" => null
  sortOrder: string;
  isRequired: boolean; // UI helper => minSelect>=1
};

function createEmptyBindDraft(): BindDraft {
  return {
    templateGroupStableId: '',
    minSelect: '',
    maxSelect: '',
    sortOrder: '',
    isRequired: false,
  };
}

type CreateCategoryPayload = {
  nameEn: string;
  nameZh?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type CreateItemPayload = {
  categoryStableId: string;
  nameEn: string;
  nameZh?: string | null;
  basePriceCents: number;
  sortOrder?: number;
  isAvailable?: boolean;
  visibility?: "PUBLIC" | "HIDDEN";
};


const BIND_ENDPOINT = (itemStableId: string) =>
  `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings`;

const UNBIND_ENDPOINT = (
  itemStableId: string,
  templateGroupStableId: string,
) =>
  `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings/${encodeURIComponent(
    templateGroupStableId,
  )}`;

function toIntOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toIntOrZero(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function isTempUnavailable(tempUnavailableUntil?: string | null): boolean {
  if (!tempUnavailableUntil) return false;
  const parsed = Date.parse(tempUnavailableUntil);
  if (!Number.isFinite(parsed)) return false;
  return parsed > Date.now();
}

function itemStatusLabel(isZh: boolean, isAvailable: boolean, tempUntil: string | null): string {
  if (!isAvailable) return isZh ? '下架' : 'Off';
  if (tempUntil && isTempUnavailable(tempUntil)) return isZh ? '今日下架' : 'Off today';
  return isZh ? '在售' : 'On';
}


export default function AdminMenuPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const isZh = locale === 'zh';

  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categories, setCategories] = useState<AdminMenuCategoryDto[]>([]);
  const [templates, setTemplates] = useState<MenuTemplateLite[]>([]);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<SavingState>({ itemStableId: null, error: null });

  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const [bindingItemId, setBindingItemId] = useState<string | null>(null);

  const [bindDrafts, setBindDrafts] = useState<Record<string, BindDraft>>({});
  const [availabilityTarget, setAvailabilityTarget] = useState<AvailabilityTarget | null>(null);

  // ----- Create category form -----
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [newCatNameZh, setNewCatNameZh] = useState('');
  const [newCatSortOrder, setNewCatSortOrder] = useState('0');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null);

  // ----- Create item form per category -----
  const [newItemDraft, setNewItemDraft] = useState<
    Record<
      string,
      {
        nameEn: string;
        nameZh: string;
        basePriceCents: string;
        sortOrder: string;
      }
    >
  >({});

  const templateByStableId = useMemo(() => {
    const m = new Map<string, MenuTemplateLite>();
    for (const t of templates) m.set(t.templateGroupStableId, t);
    return m;
  }, [templates]);


  function getBindDraft(itemStableId: string): BindDraft {
    return bindDrafts[itemStableId] ?? createEmptyBindDraft();
  }

  function toggleItemExpanded(itemStableId: string) {
    setExpandedItems((prev) => ({ ...prev, [itemStableId]: !prev[itemStableId] }));
  }

  function updateItemField<K extends keyof MenuItemWithBindingsDto>(
    categoryStableId: string,
    itemStableId: string,
    field: K,
    value: MenuItemWithBindingsDto[K],
  ) {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.stableId !== categoryStableId
          ? cat
          : {
              ...cat,
              items: cat.items.map((item) =>
                item.stableId !== itemStableId ? item : { ...item, [field]: value },
              ),
            },
      ),
    );
  }

  async function load(): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch<AdminMenuFullResponse>('/admin/menu/full');
      setCategories(data.categories ?? []);
      setTemplates(data.templatesLite ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreateCategory(): Promise<void> {
    setCreateCategoryError(null);

    const nameEn = newCatNameEn.trim();
    const nameZh = newCatNameZh.trim();
    if (!nameEn) {
      setCreateCategoryError(isZh ? '英文名称必填' : 'English name is required.');
      return;
    }

    const payload: CreateCategoryPayload = {
      nameEn,
      nameZh: nameZh ? nameZh : null,
      sortOrder: toIntOrZero(newCatSortOrder),
      isActive: true,
    };

    setCreatingCategory(true);
    try {
      await apiFetch('/admin/menu/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setNewCatNameEn('');
      setNewCatNameZh('');
      setNewCatSortOrder('0');
      await load();
    } catch (e) {
      setCreateCategoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingCategory(false);
    }
  }

  function getNewItemDraft(categoryStableId: string) {
    return (
      newItemDraft[categoryStableId] ?? {
        nameEn: '',
        nameZh: '',
        basePriceCents: '0',
        sortOrder: '0',
      }
    );
  }

  async function handleCreateItem(categoryStableId: string): Promise<void> {
    const draft = getNewItemDraft(categoryStableId);
    const nameEn = draft.nameEn.trim();
    const nameZh = draft.nameZh.trim();
    const basePriceCents = toIntOrZero(draft.basePriceCents);
    const sortOrder = toIntOrZero(draft.sortOrder);

    if (!nameEn) {
      alert(isZh ? '菜品英文名必填' : 'Item English name is required.');
      return;
    }

    const payload: CreateItemPayload = {
      categoryStableId,
      nameEn,
      nameZh: nameZh ? nameZh : null,
      basePriceCents,
      sortOrder,
      isAvailable: true,
      visibility: "PUBLIC",
    };

    try {
      await apiFetch('/admin/menu/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      setNewItemDraft((prev) => ({ ...prev, [categoryStableId]: getNewItemDraft('') }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }


  async function handleSaveItem(categoryStableId: string, itemStableId: string): Promise<void> {
    setSaving({ itemStableId, error: null });

    try {
      const category = categories.find((c) => c.stableId === categoryStableId);
      const item = category?.items.find((i) => i.stableId === itemStableId);
      if (!item) throw new Error(isZh ? '找不到菜品' : 'Item not found.');

      const body: Record<string, unknown> = {
        categoryStableId: item.categoryStableId,
        nameEn: item.nameEn,
        nameZh: item.nameZh ?? undefined,
        basePriceCents: item.basePriceCents,
        isAvailable: item.isAvailable,
        visibility: item.visibility,
        sortOrder: item.sortOrder,
        imageUrl: item.imageUrl ?? undefined,
        ingredientsEn: item.ingredientsEn ?? undefined,
        ingredientsZh: item.ingredientsZh ?? undefined,
      };

      await apiFetch(`/admin/menu/items/${encodeURIComponent(itemStableId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      setSaving({ itemStableId: null, error: null });
      await load();
    } catch (e) {
      setSaving({
        itemStableId: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function setItemAvailability(
    itemStableId: string,
    mode: 'ON' | 'TEMP_TODAY_OFF' | 'PERMANENT_OFF',
  ): Promise<void> {
    try {
      await apiFetch(`/admin/menu/items/${encodeURIComponent(itemStableId)}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyAvailabilityChoice(mode: 'TEMP_TODAY_OFF' | 'PERMANENT_OFF') {
    if (!availabilityTarget) return;
    const target = availabilityTarget;
    setAvailabilityTarget(null);
    await setItemAvailability(target.stableId, mode);
  }

  function applyTemplateDefaultsToBindDraft(itemStableId: string, templateGroupStableId: string) {
    const tpl = templates.find((t) => t.templateGroupStableId === templateGroupStableId);
    if (!tpl) return;

    setBindDrafts((prev) => {
      const next: BindDraft = {
        ...(prev[itemStableId] ?? createEmptyBindDraft()),
        templateGroupStableId,
        minSelect: String(tpl.defaultMinSelect ?? 0),
        maxSelect: tpl.defaultMaxSelect == null ? '' : String(tpl.defaultMaxSelect),
        sortOrder: String(tpl.sortOrder ?? 0),
        isRequired: (tpl.defaultMinSelect ?? 0) > 0,
      };
      return { ...prev, [itemStableId]: next };
    });
  }

  async function handleBindTemplateToItem(itemStableId: string): Promise<void> {
    const draft = getBindDraft(itemStableId);
    const templateGroupStableId = draft.templateGroupStableId;

    if (!templateGroupStableId) {
      alert(isZh ? '请选择一个选项组模板' : 'Please select a template group.');
      return;
    }

    const minSelectRaw = toIntOrNull(draft.minSelect);
    const maxSelectRaw = toIntOrNull(draft.maxSelect);
    const sortOrderRaw = toIntOrNull(draft.sortOrder);

    const minSelect = Math.max(0, minSelectRaw ?? 0);
    const maxSelect = maxSelectRaw == null ? null : Math.max(0, maxSelectRaw);
    const sortOrder = Math.max(0, sortOrderRaw ?? 0);

    setBindingItemId(itemStableId);
    try {
      await apiFetch(BIND_ENDPOINT(itemStableId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateGroupStableId,
          minSelect,
          maxSelect,
          sortOrder,
          isEnabled: true,
        }),
      });

      setBindDrafts((prev) => ({ ...prev, [itemStableId]: createEmptyBindDraft() }));
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingItemId(null);
    }
  }

  async function handleUnbindFromItem(
    itemStableId: string,
    templateGroupStableId: string,
  ): Promise<void> {
    setUnbindingId(templateGroupStableId);
    try {
      await apiFetch(UNBIND_ENDPOINT(itemStableId, templateGroupStableId), {
        method: 'DELETE',
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setUnbindingId(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">{isZh ? '菜单管理' : 'Menu Admin'}</h1>
        <p className="mt-4 text-sm text-slate-600">{isZh ? '加载中…' : 'Loading…'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{isZh ? '菜单管理' : 'Menu Admin'}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {isZh
              ? '这里维护分类、菜品，以及菜品绑定的选项组模板（全链路 stableId）。'
              : 'Manage categories, items, and item-to-template bindings (stableId end-to-end).'}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/${locale}/admin`}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {isZh ? '返回后台' : 'Back'}
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
          >
            {isZh ? '刷新' : 'Refresh'}
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {isZh ? '加载失败：' : 'Load failed: '} {loadError}
        </div>
      ) : null}

      {/* Create Category */}
      <section className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-base font-semibold">{isZh ? '创建分类' : 'Create Category'}</h2>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
            <input
              value={newCatNameEn}
              onChange={(e) => setNewCatNameEn(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder={isZh ? '例如: Drinks' : 'e.g. Drinks'}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
            <input
              value={newCatNameZh}
              onChange={(e) => setNewCatNameZh(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder={isZh ? '例如: 饮品' : 'e.g. 饮品'}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort order'}</div>
            <input
              value={newCatSortOrder}
              onChange={(e) => setNewCatSortOrder(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              inputMode="numeric"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              disabled={creatingCategory}
              className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {creatingCategory ? (isZh ? '创建中…' : 'Creating…') : isZh ? '创建分类' : 'Create'}
            </button>
          </div>
        </div>

        {createCategoryError ? (
          <div className="mt-3 text-sm text-red-700">{createCategoryError}</div>
        ) : null}
      </section>

      {/* Categories + Items */}
      <section className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.stableId} className="rounded-xl border border-slate-200">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4">
              <div>
                <div className="text-base font-semibold">
                  {isZh ? cat.nameZh ?? cat.nameEn : cat.nameEn}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  stableId: <span className="font-mono">{cat.stableId}</span> · sort:{' '}
                  {cat.sortOrder} · {cat.isActive ? (isZh ? '启用' : 'active') : isZh ? '停用' : 'inactive'}
                </div>
              </div>

              <div className="text-xs text-slate-500">
                {isZh ? '分类编辑在 options/分类页做（如你已有该页）' : 'Category edits can live elsewhere if you have it.'}
              </div>
            </div>

            {/* Create item in category */}
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-sm font-semibold">{isZh ? '创建菜品' : 'Create Item'}</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-6">
                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).nameEn}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: { ...getNewItemDraft(cat.stableId), nameEn: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={isZh ? '例如: Beef Noodles' : 'e.g. Beef Noodles'}
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).nameZh}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: { ...getNewItemDraft(cat.stableId), nameZh: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    placeholder={isZh ? '例如: 牛肉面' : 'e.g. 牛肉面'}
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">{isZh ? '价格(分)' : 'Price (cents)'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).basePriceCents}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: {
                          ...getNewItemDraft(cat.stableId),
                          basePriceCents: e.target.value,
                        },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    inputMode="numeric"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                  <input
                    value={getNewItemDraft(cat.stableId).sortOrder}
                    onChange={(e) =>
                      setNewItemDraft((prev) => ({
                        ...prev,
                        [cat.stableId]: { ...getNewItemDraft(cat.stableId), sortOrder: e.target.value },
                      }))
                    }
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    inputMode="numeric"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => void handleCreateItem(cat.stableId)}
                    className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                  >
                    {isZh ? '创建' : 'Create'}
                  </button>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div className="divide-y divide-slate-200">
              {cat.items.map((item) => {
                const expanded = !!expandedItems[item.stableId];

                return (
                  <div key={item.stableId} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold">
                          {isZh ? item.nameZh ?? item.nameEn : item.nameEn}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          stableId: <span className="font-mono">{item.stableId}</span> · categoryStableId:{' '}
                          <span className="font-mono">{item.categoryStableId}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleItemExpanded(item.stableId)}
                          className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          {expanded ? (isZh ? '收起' : 'Collapse') : isZh ? '编辑' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const isOn = item.isAvailable && !isTempUnavailable(item.tempUnavailableUntil);
                            if (isOn) {
                              setAvailabilityTarget({
                                stableId: item.stableId,
                                label: isZh ? item.nameZh ?? item.nameEn : item.nameEn,
                              });
                              return;
                            }
                            void setItemAvailability(item.stableId, 'ON');
                          }}
                          className={`rounded-md px-3 py-2 text-sm ${
                            item.isAvailable && !isTempUnavailable(item.tempUnavailableUntil)
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {itemStatusLabel(isZh, item.isAvailable, item.tempUnavailableUntil)}
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleSaveItem(cat.stableId, item.stableId)}
                          disabled={saving.itemStableId !== null}
                          className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                        >
                          {saving.itemStableId === item.stableId
                            ? isZh
                              ? '保存中…'
                              : 'Saving…'
                            : isZh
                              ? '保存'
                              : 'Save'}
                        </button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 space-y-5">
                        {/* Basic fields */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                          <label className="space-y-1 md:col-span-2">
                            <div className="text-xs text-slate-600">{isZh ? '英文名' : 'Name (EN)'}</div>
                            <input
                              value={item.nameEn}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'nameEn', e.target.value)
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="space-y-1 md:col-span-2">
                            <div className="text-xs text-slate-600">{isZh ? '中文名' : 'Name (ZH)'}</div>
                            <input
                              value={item.nameZh ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'nameZh',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs text-slate-600">{isZh ? '价格(分)' : 'Price (cents)'}</div>
                            <input
                              value={String(item.basePriceCents)}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'basePriceCents', toIntOrZero(e.target.value))
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              inputMode="numeric"
                            />
                          </label>

                          <label className="space-y-1">
                            <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                            <input
                              value={String(item.sortOrder)}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'sortOrder', toIntOrZero(e.target.value))
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              inputMode="numeric"
                            />
                          </label>

                          <label className="flex items-center gap-2 md:col-span-3">
                            <input
                              type="checkbox"
                              checked={item.visibility === "PUBLIC"}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  "visibility",
                                  e.target.checked ? "PUBLIC" : "HIDDEN",
                                )
                              }
                            />
                            <span className="text-sm">{isZh ? "对顾客可见" : "Visible to customers"}</span>
                          </label>

                          <label className="flex items-center gap-2 md:col-span-3">
                            <input
                              type="checkbox"
                              checked={item.isAvailable}
                              onChange={(e) =>
                                updateItemField(cat.stableId, item.stableId, 'isAvailable', e.target.checked)
                              }
                            />
                            <span className="text-sm">{isZh ? '可售' : 'Available'}</span>
                          </label>

                          <label className="space-y-1 md:col-span-6">
                            <div className="text-xs text-slate-600">{isZh ? '图片URL' : 'Image URL'}</div>
                            <input
                              value={item.imageUrl ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'imageUrl',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              placeholder="https://..."
                            />
                          </label>

                          <label className="space-y-1 md:col-span-3">
                            <div className="text-xs text-slate-600">{isZh ? '配料说明(英)' : 'Ingredients (EN)'}</div>
                            <textarea
                              value={item.ingredientsEn ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'ingredientsEn',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>

                          <label className="space-y-1 md:col-span-3">
                            <div className="text-xs text-slate-600">{isZh ? '配料说明(中)' : 'Ingredients (ZH)'}</div>
                            <textarea
                              value={item.ingredientsZh ?? ''}
                              onChange={(e) =>
                                updateItemField(
                                  cat.stableId,
                                  item.stableId,
                                  'ingredientsZh',
                                  e.target.value ? e.target.value : null,
                                )
                              }
                              className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>

                        {/* Option group bindings */}
                        <div className="rounded-lg border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h4 className="text-sm font-semibold">{isZh ? '选项组绑定' : 'Option Group Bindings'}</h4>
                              <p className="mt-1 text-xs text-slate-500">
                                {isZh
                                  ? '绑定的是“模板组选项组”(templateGroupStableId)，解绑需要 bindingStableId。'
                                  : 'Binding uses templateGroupStableId; unbind requires bindingStableId.'}
                              </p>
                            </div>

                            <Link
                              href={`/${locale}/admin/menu/options`}
                              className="text-sm text-slate-700 underline hover:text-slate-900"
                            >
                              {isZh ? '管理选项组模板' : 'Manage templates'}
                            </Link>
                          </div>

                          {/* Bound list */}
                          <div className="mt-3 space-y-2">
                            {item.optionGroups.length === 0 ? (
                              <div className="text-sm text-slate-600">
                                {isZh ? '暂无绑定' : 'No bindings yet.'}
                              </div>
                            ) : (
                              item.optionGroups
                                .slice()
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((g) => {
                                  const tplStableId = g.templateGroupStableId;
                                  const bindingStableId = g.bindingStableId ?? null;
                                  const tpl = templateByStableId.get(tplStableId) ?? g.template;
                                  const groupName = isZh
                                    ? tpl?.nameZh ?? tpl?.nameEn
                                    : tpl?.nameEn ?? tplStableId;
                                  const unbindKey = bindingStableId ?? tplStableId;

                                  return (
                                    <div
                                      key={bindingStableId ?? tplStableId}
                                      className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                          {groupName}{' '}
                                          <span className="ml-2 text-xs text-slate-500">
                                            ({isZh ? '排序' : 'sort'}: {g.sortOrder} ·{' '}
                                            {isZh ? 'min' : 'min'}: {g.minSelect} ·{' '}
                                            {isZh ? 'max' : 'max'}:{' '}
                                            {g.maxSelect == null ? (isZh ? '不限' : '∞') : g.maxSelect})
                                          </span>
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                          templateGroupStableId:{' '}
                                          <span className="font-mono">{tplStableId}</span>
                                          {bindingStableId ? (
                                            <>
                                              {' '}
                                              · bindingStableId:{' '}
                                              <span className="font-mono">{bindingStableId}</span>
                                            </>
                                          ) : null}
                                          {tpl?.isAvailable === false ? (
                                            <span className="ml-2 text-xs text-amber-700">
                                              {isZh ? '模板当前不可用' : 'Template unavailable'}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="flex shrink-0 items-center gap-2">
                                        <Link
                                          href={`/${locale}/admin/menu/options#group-${tplStableId}`}
                                          className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                                        >
                                          {isZh ? '查看模板' : 'View'}
                                        </Link>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleUnbindFromItem(item.stableId, unbindKey)
                                          }
                                          disabled={unbindingId === unbindKey}
                                          className="rounded-md bg-rose-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                                        >
                                          {unbindingId === unbindKey
                                            ? isZh
                                              ? '解绑中…'
                                              : 'Removing…'
                                            : isZh
                                              ? '解绑'
                                              : 'Unbind'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                            )}
                          </div>

                          {/* Bind new */}
                          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-12">
                            <label className="space-y-1 md:col-span-5">
                              <div className="text-xs text-slate-600">{isZh ? '模板组选项组' : 'Template group'}</div>
                              <select
                                value={getBindDraft(item.stableId).templateGroupStableId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...(prev[item.stableId] ?? createEmptyBindDraft()), templateGroupStableId: v },
                                  }));
                                  applyTemplateDefaultsToBindDraft(item.stableId, v);
                                }}
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                              >
                                <option value="">{isZh ? '请选择…' : 'Select…'}</option>
                                {templates
                                  .slice()
                                  .sort((a, b) => a.sortOrder - b.sortOrder)
                                  .map((t) => (
                                    <option key={t.templateGroupStableId} value={t.templateGroupStableId}>
                                      {isZh ? (t.nameZh ?? t.nameEn) : t.nameEn} — {t.templateGroupStableId}
                                    </option>
                                  ))}
                              </select>
                            </label>

                            <label className="space-y-1 md:col-span-2">
                              <div className="text-xs text-slate-600">{isZh ? '最少选' : 'Min'}</div>
                              <input
                                value={getBindDraft(item.stableId).minSelect}
                                onChange={(e) =>
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...getBindDraft(item.stableId), minSelect: e.target.value },
                                  }))
                                }
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                              />
                            </label>

                            <label className="space-y-1 md:col-span-2">
                              <div className="text-xs text-slate-600">{isZh ? '最多选' : 'Max'}</div>
                              <input
                                value={getBindDraft(item.stableId).maxSelect}
                                onChange={(e) =>
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...getBindDraft(item.stableId), maxSelect: e.target.value },
                                  }))
                                }
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                                placeholder={isZh ? '留空=不限' : 'blank = ∞'}
                              />
                            </label>

                            <label className="space-y-1 md:col-span-2">
                              <div className="text-xs text-slate-600">{isZh ? '排序' : 'Sort'}</div>
                              <input
                                value={getBindDraft(item.stableId).sortOrder}
                                onChange={(e) =>
                                  setBindDrafts((prev) => ({
                                    ...prev,
                                    [item.stableId]: { ...getBindDraft(item.stableId), sortOrder: e.target.value },
                                  }))
                                }
                                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                              />
                            </label>

                            <div className="flex items-end md:col-span-1">
                              <button
                                type="button"
                                onClick={() => void handleBindTemplateToItem(item.stableId)}
                                disabled={bindingItemId === item.stableId}
                                className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                              >
                                {bindingItemId === item.stableId
                                  ? isZh
                                    ? '绑定中…'
                                    : 'Binding…'
                                  : isZh
                                    ? '绑定'
                                    : 'Bind'}
                              </button>
                            </div>
                          </div>
                        </div>

                        {saving.error ? (
                          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {isZh ? '保存失败：' : 'Save failed: '} {saving.error}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {availabilityTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {isZh ? '选择下架方式' : 'Select off mode'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {isZh ? '对' : 'For '}
              <span className="font-semibold text-slate-900">{availabilityTarget.label}</span>
              {isZh ? '设置下架方式' : ', choose how to turn off availability.'}
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => void applyAvailabilityChoice('TEMP_TODAY_OFF')}
                className="w-full rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                {isZh ? '当日下架' : 'Off today'}
              </button>
              <button
                type="button"
                onClick={() => void applyAvailabilityChoice('PERMANENT_OFF')}
                className="w-full rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                {isZh ? '永久下架' : 'Off permanently'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAvailabilityTarget(null)}
              className="mt-4 w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              {isZh ? '取消' : 'Cancel'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
