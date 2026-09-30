'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { ImageLibraryModal } from '@/components/admin/ImageLibraryModal';
import { apiFetch } from '@/lib/api/client';
import type { Locale } from '@/lib/i18n/locales';
import {
  StaffEmptyState,
  StaffPage,
  StaffPageHeader,
} from '@/components/staff/StaffPrimitives';
import type {
  MenuCategoryBaseDto,
  MenuItemWithBindingsDto,
  MenuPackagingTypeDto,
  MenuTemplateLite,
} from '@shared/menu';

type UberSyncStatus =
  | 'SYNCED'
  | 'SYNC_REQUESTED'
  | 'SKIPPED_NOT_PUBLISHED'
  | 'FAILED';

type AvailabilityTarget = {
  stableId: string;
  label: string;
};

type CreateDraft = {
  categoryStableId: string;
  nameEn: string;
  nameZh: string;
  basePriceCents: string;
  sortOrder: string;
  publishToUberEats: boolean;
};

type BindingDraft = {
  templateGroupStableId: string;
  minSelect: string;
  maxSelect: string;
  sortOrder: string;
  affectedPackagingTypeStableId: string;
};

type ComponentDraft = {
  componentItemStableId: string;
  quantity: string;
};

const EMPTY_BINDING: BindingDraft = {
  templateGroupStableId: '',
  minSelect: '',
  maxSelect: '',
  sortOrder: '',
  affectedPackagingTypeStableId: '',
};

function toIntOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function toIntOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function isTempUnavailable(value: string | null): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export default function AdminMenuItemsPage() {
  const { locale } = useParams<{ locale: Locale }>();
  const searchParams = useSearchParams();
  const storeStableId = searchParams.get('store')?.trim() ?? '';
  const safeLocale: Locale = locale === 'zh' ? 'zh' : 'en';
  const isZh = safeLocale === 'zh';

  const [categories, setCategories] = useState<MenuCategoryBaseDto[]>([]);
  const [items, setItems] = useState<MenuItemWithBindingsDto[]>([]);
  const [templates, setTemplates] = useState<MenuTemplateLite[]>([]);
  const [packagingTypes, setPackagingTypes] = useState<MenuPackagingTypeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingItemStableId, setSavingItemStableId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uberSyncByItem, setUberSyncByItem] = useState<Record<string, UberSyncStatus>>({});
  const [availabilityTarget, setAvailabilityTarget] =
    useState<AvailabilityTarget | null>(null);

  const [createDraft, setCreateDraft] = useState<CreateDraft>({
    categoryStableId: '',
    nameEn: '',
    nameZh: '',
    basePriceCents: '0',
    sortOrder: '0',
    publishToUberEats: false,
  });
  const [creatingItem, setCreatingItem] = useState(false);

  const [bindingDrafts, setBindingDrafts] = useState<Record<string, BindingDraft>>({});
  const [bindingEditDrafts, setBindingEditDrafts] = useState<
    Record<string, BindingDraft>
  >({});
  const [bindingSavingKey, setBindingSavingKey] = useState<string | null>(null);
  const [newPackagingName, setNewPackagingName] = useState('');
  const [creatingPackaging, setCreatingPackaging] = useState(false);
  const [componentDrafts, setComponentDrafts] = useState<
    Record<string, ComponentDraft>
  >({});
  const [imageUploads, setImageUploads] = useState<
    Record<string, { uploading: boolean; error: string | null }>
  >({});
  const [activeImageItemStableId, setActiveImageItemStableId] =
    useState<string | null>(null);

  const storeScopedPath = useCallback(
    (path: string) => {
      if (!storeStableId) return path;
      const separator = path.includes('?') ? '&' : '?';
      return `${path}${separator}storeStableId=${encodeURIComponent(storeStableId)}`;
    },
    [storeStableId],
  );

  const itemByStableId = useMemo(
    () => new Map(items.map((item) => [item.stableId, item])),
    [items],
  );

  const groupedItems = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: items.filter(
          (item) => item.categoryStableId === category.stableId,
        ),
      })),
    [categories, items],
  );

  const load = useCallback(async (): Promise<void> => {
    if (!storeStableId) {
      setCategories([]);
      setItems([]);
      setTemplates([]);
      setPackagingTypes([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const [categoriesRes, itemsRes, templatesRes, packagingRes] =
        await Promise.all([
          apiFetch<MenuCategoryBaseDto[]>(
            storeScopedPath('/admin/menu/categories'),
          ),
          apiFetch<MenuItemWithBindingsDto[]>(
            storeScopedPath('/admin/menu/items'),
          ),
          apiFetch<MenuTemplateLite[]>(
            storeScopedPath('/admin/menu/option-group-templates'),
          ),
          apiFetch<MenuPackagingTypeDto[]>('/admin/menu/packaging-types'),
        ]);

      setCategories(categoriesRes ?? []);
      setItems(itemsRes ?? []);
      setTemplates(templatesRes ?? []);
      setPackagingTypes(packagingRes ?? []);
      setCreateDraft((current) => ({
        ...current,
        categoryStableId:
          current.categoryStableId || categoriesRes?.[0]?.stableId || '',
      }));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [storeScopedPath, storeStableId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateItem<K extends keyof MenuItemWithBindingsDto>(
    itemStableId: string,
    field: K,
    value: MenuItemWithBindingsDto[K],
  ): void {
    setItems((current) =>
      current.map((item) =>
        item.stableId === itemStableId ? { ...item, [field]: value } : item,
      ),
    );
  }

  async function createItem(): Promise<void> {
    const nameEn = createDraft.nameEn.trim();
    if (!createDraft.categoryStableId || !nameEn) {
      window.alert(
        isZh
          ? '请选择分类并填写菜品英文名'
          : 'Choose a category and enter the English item name.',
      );
      return;
    }

    setCreatingItem(true);
    try {
      await apiFetch(storeScopedPath('/admin/menu/items'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryStableId: createDraft.categoryStableId,
          nameEn,
          nameZh: createDraft.nameZh.trim() || null,
          basePriceCents: toIntOrZero(createDraft.basePriceCents),
          sortOrder: toIntOrZero(createDraft.sortOrder),
          isAvailable: true,
          visibility: 'PUBLIC',
          isVisibleOnMainMenu: true,
          publishToUberEats: createDraft.publishToUberEats,
        }),
      });
      setCreateDraft((current) => ({
        ...current,
        nameEn: '',
        nameZh: '',
        basePriceCents: '0',
        sortOrder: '0',
        publishToUberEats: false,
      }));
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingItem(false);
    }
  }

  async function saveItem(item: MenuItemWithBindingsDto): Promise<void> {
    setSavingItemStableId(item.stableId);
    setSaveError(null);
    try {
      await apiFetch(
        storeScopedPath(
          `/admin/menu/items/${encodeURIComponent(item.stableId)}`,
        ),
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryStableId: item.categoryStableId,
            nameEn: item.nameEn,
            nameZh: item.nameZh ?? undefined,
            basePriceCents: item.basePriceCents,
            visibility: item.visibility,
            isVisibleOnMainMenu: item.isVisibleOnMainMenu,
            publishToUberEats: item.publishToUberEats,
            labelStrategy: item.labelStrategy,
            itemKind: item.itemKind,
            packagingTypeStableIds: item.packagings.map(
              (packaging) => packaging.packagingType.stableId,
            ),
            fixedComponents: item.fixedComponents.map((component, index) => ({
              componentItemStableId: component.componentItemStableId,
              quantity: component.quantity,
              sortOrder: index,
            })),
            sortOrder: item.sortOrder,
            imageUrl: item.imageUrl ?? undefined,
            ingredientsEn: item.ingredientsEn ?? undefined,
            ingredientsZh: item.ingredientsZh ?? undefined,
          }),
        },
      );
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingItemStableId(null);
    }
  }

  async function setAvailability(
    itemStableId: string,
    mode: 'ON' | 'TEMP_TODAY_OFF' | 'PERMANENT_OFF',
  ): Promise<void> {
    try {
      const result = await apiFetch<{ uberSync: { status: UberSyncStatus } }>(
        storeScopedPath(
          `/admin/menu/items/${encodeURIComponent(itemStableId)}/availability`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        },
      );
      setUberSyncByItem((current) => ({
        ...current,
        [itemStableId]: result.uberSync.status,
      }));
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function getBindingDraft(itemStableId: string): BindingDraft {
    return bindingDrafts[itemStableId] ?? EMPTY_BINDING;
  }

  function getBindingEditDraft(
    itemStableId: string,
    binding: MenuItemWithBindingsDto['optionGroups'][number],
  ): BindingDraft {
    const key = `${itemStableId}:${binding.templateGroupStableId}`;
    return (
      bindingEditDrafts[key] ?? {
        templateGroupStableId: binding.templateGroupStableId,
        minSelect: String(binding.minSelect),
        maxSelect:
          binding.maxSelect == null ? '' : String(binding.maxSelect),
        sortOrder: String(binding.sortOrder),
        affectedPackagingTypeStableId:
          binding.affectedPackagingTypeStableIds[0] ?? '',
      }
    );
  }

  function applyTemplateDefaults(
    itemStableId: string,
    templateGroupStableId: string,
  ): void {
    const template = templates.find(
      (candidate) => candidate.templateGroupStableId === templateGroupStableId,
    );
    setBindingDrafts((current) => ({
      ...current,
      [itemStableId]: {
        ...getBindingDraft(itemStableId),
        templateGroupStableId,
        minSelect: String(template?.defaultMinSelect ?? 0),
        maxSelect:
          template?.defaultMaxSelect == null
            ? ''
            : String(template.defaultMaxSelect),
        sortOrder: String(template?.sortOrder ?? 0),
      },
    }));
  }

  async function saveBinding(
    itemStableId: string,
    draft: BindingDraft,
  ): Promise<void> {
    if (!draft.templateGroupStableId) return;
    const key = `${itemStableId}:${draft.templateGroupStableId}`;
    setBindingSavingKey(key);
    try {
      await apiFetch(
        storeScopedPath(
          `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateGroupStableId: draft.templateGroupStableId,
            minSelect: Math.max(0, toIntOrNull(draft.minSelect) ?? 0),
            maxSelect:
              toIntOrNull(draft.maxSelect) == null
                ? null
                : Math.max(0, toIntOrNull(draft.maxSelect) ?? 0),
            sortOrder: Math.max(0, toIntOrNull(draft.sortOrder) ?? 0),
            isEnabled: true,
            affectedPackagingTypeStableIds:
              draft.affectedPackagingTypeStableId
                ? [draft.affectedPackagingTypeStableId]
                : [],
          }),
        },
      );
      setBindingDrafts((current) => ({
        ...current,
        [itemStableId]: EMPTY_BINDING,
      }));
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBindingSavingKey(null);
    }
  }

  async function updateBinding(
    itemStableId: string,
    binding: MenuItemWithBindingsDto['optionGroups'][number],
  ): Promise<void> {
    const draft = getBindingEditDraft(itemStableId, binding);
    const key = `${itemStableId}:${binding.templateGroupStableId}`;
    setBindingSavingKey(key);
    try {
      await apiFetch(
        storeScopedPath(
          `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings`,
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateGroupStableId: binding.templateGroupStableId,
            minSelect: Math.max(0, toIntOrNull(draft.minSelect) ?? 0),
            maxSelect:
              toIntOrNull(draft.maxSelect) == null
                ? null
                : Math.max(0, toIntOrNull(draft.maxSelect) ?? 0),
            sortOrder: Math.max(0, toIntOrNull(draft.sortOrder) ?? 0),
            isEnabled: true,
            affectedPackagingTypeStableIds:
              draft.affectedPackagingTypeStableId
                ? [draft.affectedPackagingTypeStableId]
                : [],
          }),
        },
      );
      setBindingEditDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBindingSavingKey(null);
    }
  }

  async function removeBinding(
    itemStableId: string,
    templateGroupStableId: string,
  ): Promise<void> {
    const key = `${itemStableId}:${templateGroupStableId}`;
    setBindingSavingKey(key);
    try {
      await apiFetch(
        storeScopedPath(
          `/admin/menu/items/${encodeURIComponent(itemStableId)}/option-group-bindings/${encodeURIComponent(templateGroupStableId)}`,
        ),
        { method: 'DELETE' },
      );
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBindingSavingKey(null);
    }
  }

  async function createPackagingType(): Promise<void> {
    const name = newPackagingName.trim();
    if (!name) return;
    setCreatingPackaging(true);
    try {
      await apiFetch('/admin/menu/packaging-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isActive: true }),
      });
      setNewPackagingName('');
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingPackaging(false);
    }
  }

  async function uploadImage(itemStableId: string, file: File): Promise<void> {
    setImageUploads((current) => ({
      ...current,
      [itemStableId]: { uploading: true, error: null },
    }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetch<{ url: string }>('/admin/upload/image', {
        method: 'POST',
        body: formData,
      });
      updateItem(itemStableId, 'imageUrl', result.url);
      setImageUploads((current) => ({
        ...current,
        [itemStableId]: { uploading: false, error: null },
      }));
    } catch (error) {
      setImageUploads((current) => ({
        ...current,
        [itemStableId]: {
          uploading: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  if (!storeStableId) {
    return (
      <StaffPage>
        <StaffPageHeader
          eyebrow={isZh ? '菜单' : 'Catalog'}
          title={isZh ? '菜品管理' : 'Item management'}
          description={
            isZh
              ? '按当前门店维护菜品、包装、套餐组成与选项绑定。'
              : 'Maintain items, packaging, combo composition and option bindings for the current store.'
          }
        />
        <StaffEmptyState
          icon={<UtensilsCrossed className="size-5" aria-hidden="true" />}
          title={isZh ? '请先选择门店' : 'Select a store first'}
          description={
            isZh
              ? '选择门店后才能读取和维护菜品。'
              : 'Choose a store before loading or editing items.'
          }
        />
      </StaffPage>
    );
  }

  return (
    <StaffPage>
      <StaffPageHeader
        eyebrow={isZh ? '菜单' : 'Catalog'}
        title={isZh ? '菜品管理' : 'Item management'}
        description={
          isZh
            ? '独立的 Store-scoped 菜品工作区；只读取分类、菜品、选项与包装所需的窄接口。'
            : 'Independent Store-scoped item workspace using narrow category, item, option and packaging reads.'
        }
      />

      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">
                {isZh ? '创建菜品' : 'Create item'}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {isZh
                  ? '分类由当前门店的独立 Category contract 提供。'
                  : 'Categories come from the current Store category contract.'}
              </p>
            </div>
            <Link
              href={`/${safeLocale}/admin/menu/categories?store=${encodeURIComponent(storeStableId)}`}
              className="text-sm font-medium text-emerald-700"
            >
              {isZh ? '分类管理' : 'Manage categories'}
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-7">
            <select
              value={createDraft.categoryStableId}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  categoryStableId: event.target.value,
                }))
              }
              className="rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2"
            >
              <option value="">{isZh ? '选择分类' : 'Choose category'}</option>
              {categories.map((category) => (
                <option key={category.stableId} value={category.stableId}>
                  {isZh ? category.nameZh ?? category.nameEn : category.nameEn}
                </option>
              ))}
            </select>
            <input
              value={createDraft.nameEn}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  nameEn: event.target.value,
                }))
              }
              placeholder={isZh ? '英文名' : 'Name (EN)'}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={createDraft.nameZh}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  nameZh: event.target.value,
                }))
              }
              placeholder={isZh ? '中文名' : 'Name (ZH)'}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={createDraft.basePriceCents}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  basePriceCents: event.target.value,
                }))
              }
              placeholder={isZh ? '价格(分)' : 'Price (cents)'}
              inputMode="numeric"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={createDraft.sortOrder}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
              placeholder={isZh ? '排序' : 'Sort'}
              inputMode="numeric"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={creatingItem}
              onClick={() => void createItem()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creatingItem
                ? isZh
                  ? '创建中…'
                  : 'Creating…'
                : isZh
                  ? '创建'
                  : 'Create'}
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createDraft.publishToUberEats}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  publishToUberEats: event.target.checked,
                }))
              }
            />
            {isZh ? '创建时发布到 Uber Eats' : 'Publish to Uber Eats on create'}
          </label>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">
            {isZh ? '包装单品' : 'Packaging'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? '包装类型是品牌级字典；菜品使用哪些包装仍在各菜品编辑区选择。'
              : 'Packaging types remain a brand-level dictionary; assign them per item below.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={newPackagingName}
              onChange={(event) => setNewPackagingName(event.target.value)}
              placeholder={isZh ? '例如：16oz、38oz、三明治袋' : 'e.g. 16oz, 38oz, sandwich bag'}
              className="min-w-56 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={creatingPackaging}
              onClick={() => void createPackagingType()}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {creatingPackaging
                ? isZh
                  ? '添加中…'
                  : 'Adding…'
                : isZh
                  ? '添加包装'
                  : 'Add packaging'}
            </button>
          </div>
          {packagingTypes.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {packagingTypes.map((type) => (
                <span
                  key={type.stableId}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                >
                  {type.name}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {isZh ? '加载失败：' : 'Load failed: '}
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
            {isZh ? '加载中…' : 'Loading…'}
          </div>
        ) : items.length === 0 ? (
          <StaffEmptyState
            icon={<UtensilsCrossed className="size-5" aria-hidden="true" />}
            title={isZh ? '暂无菜品' : 'No items yet'}
            description={
              isZh
                ? '使用上方表单创建当前门店的菜品。'
                : 'Use the form above to create an item for this store.'
            }
          />
        ) : (
          groupedItems.map(({ category, items: categoryItems }) => {
            if (categoryItems.length === 0) return null;
            return (
              <section
                key={category.stableId}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="border-b border-slate-200 p-4">
                  <h2 className="font-semibold text-slate-900">
                    {isZh ? category.nameZh ?? category.nameEn : category.nameEn}
                  </h2>
                </div>
                <div className="divide-y divide-slate-200">
                  {categoryItems.map((item) => {
                    const isExpanded = !!expanded[item.stableId];
                    const bindingDraft = getBindingDraft(item.stableId);
                    const componentDraft = componentDrafts[item.stableId] ?? {
                      componentItemStableId: '',
                      quantity: '1',
                    };
                    const on =
                      item.isAvailable &&
                      !isTempUnavailable(item.tempUnavailableUntil);

                    return (
                      <div key={item.stableId} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">
                              {isZh ? item.nameZh ?? item.nameEn : item.nameEn}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.stableId} · {item.basePriceCents}¢ ·{' '}
                              {on
                                ? isZh
                                  ? '在售'
                                  : 'On'
                                : isZh
                                  ? '下架'
                                  : 'Off'}
                            </div>
                            {uberSyncByItem[item.stableId] ? (
                              <div className="mt-1 text-xs text-sky-700">
                                Uber: {uberSyncByItem[item.stableId]}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((current) => ({
                                  ...current,
                                  [item.stableId]: !current[item.stableId],
                                }))
                              }
                              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                            >
                              {isExpanded
                                ? isZh
                                  ? '收起'
                                  : 'Collapse'
                                : isZh
                                  ? '编辑'
                                  : 'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (on) {
                                  setAvailabilityTarget({
                                    stableId: item.stableId,
                                    label: isZh
                                      ? item.nameZh ?? item.nameEn
                                      : item.nameEn,
                                  });
                                } else {
                                  void setAvailability(item.stableId, 'ON');
                                }
                              }}
                              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                            >
                              {on
                                ? isZh
                                  ? '下架'
                                  : 'Turn off'
                                : isZh
                                  ? '上架'
                                  : 'Turn on'}
                            </button>
                            <button
                              type="button"
                              disabled={savingItemStableId !== null}
                              onClick={() => void saveItem(item)}
                              className="rounded-md bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                            >
                              {savingItemStableId === item.stableId
                                ? isZh
                                  ? '保存中…'
                                  : 'Saving…'
                                : isZh
                                  ? '保存'
                                  : 'Save'}
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="mt-5 space-y-5">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                              <input
                                value={item.nameEn}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'nameEn',
                                    event.target.value,
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                                aria-label="Name EN"
                              />
                              <input
                                value={item.nameZh ?? ''}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'nameZh',
                                    event.target.value || null,
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                                aria-label="Name ZH"
                              />
                              <input
                                value={String(item.basePriceCents)}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'basePriceCents',
                                    toIntOrZero(event.target.value),
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                                aria-label="Price cents"
                              />
                              <input
                                value={String(item.sortOrder)}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'sortOrder',
                                    toIntOrZero(event.target.value),
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                inputMode="numeric"
                                aria-label="Sort order"
                              />
                              <select
                                value={item.categoryStableId}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'categoryStableId',
                                    event.target.value,
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                              >
                                {categories.map((candidate) => (
                                  <option
                                    key={candidate.stableId}
                                    value={candidate.stableId}
                                  >
                                    {isZh
                                      ? candidate.nameZh ?? candidate.nameEn
                                      : candidate.nameEn}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={item.itemKind}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'itemKind',
                                    event.target
                                      .value as MenuItemWithBindingsDto['itemKind'],
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                              >
                                <option value="FOOD">
                                  {isZh ? '食品' : 'Food'}
                                </option>
                                <option value="BEVERAGE">
                                  {isZh ? '饮品' : 'Beverage'}
                                </option>
                              </select>
                              <select
                                value={item.labelStrategy}
                                onChange={(event) =>
                                  updateItem(
                                    item.stableId,
                                    'labelStrategy',
                                    event.target
                                      .value as MenuItemWithBindingsDto['labelStrategy'],
                                  )
                                }
                                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                              >
                                <option value="AUTO">AUTO</option>
                                <option value="ALWAYS">ALWAYS</option>
                                <option value="NEVER">NEVER</option>
                              </select>
                            </div>

                            <div className="flex flex-wrap gap-4 text-sm">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={item.visibility === 'PUBLIC'}
                                  onChange={(event) =>
                                    updateItem(
                                      item.stableId,
                                      'visibility',
                                      event.target.checked ? 'PUBLIC' : 'HIDDEN',
                                    )
                                  }
                                />
                                {isZh ? '顾客渠道启用' : 'Customer channels'}
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={item.isVisibleOnMainMenu}
                                  onChange={(event) =>
                                    updateItem(
                                      item.stableId,
                                      'isVisibleOnMainMenu',
                                      event.target.checked,
                                    )
                                  }
                                />
                                {isZh ? '主菜单展示' : 'Show on main menu'}
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={item.publishToUberEats}
                                  disabled={item.fixedComponents.length > 0}
                                  onChange={(event) =>
                                    updateItem(
                                      item.stableId,
                                      'publishToUberEats',
                                      event.target.checked,
                                    )
                                  }
                                />
                                {isZh ? '发布到 Uber Eats' : 'Publish to Uber Eats'}
                              </label>
                            </div>

                            <div className="rounded-lg border border-slate-200 p-4">
                              <h3 className="text-sm font-semibold">
                                {isZh ? '包装' : 'Packaging'}
                              </h3>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {packagingTypes
                                  .filter((type) => type.isActive)
                                  .map((type) => {
                                    const checked = item.packagings.some(
                                      (packaging) =>
                                        packaging.packagingType.stableId ===
                                        type.stableId,
                                    );
                                    return (
                                      <label
                                        key={type.stableId}
                                        className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) =>
                                            updateItem(
                                              item.stableId,
                                              'packagings',
                                              event.target.checked
                                                ? [
                                                    ...item.packagings,
                                                    {
                                                      sortOrder:
                                                        item.packagings.length,
                                                      packagingType: type,
                                                    },
                                                  ]
                                                : item.packagings.filter(
                                                    (packaging) =>
                                                      packaging.packagingType
                                                        .stableId !==
                                                      type.stableId,
                                                  ),
                                            )
                                          }
                                        />
                                        {type.name}
                                      </label>
                                    );
                                  })}
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="space-y-1">
                                <div className="text-xs text-slate-600">
                                  {isZh ? '配料说明(英)' : 'Ingredients (EN)'}
                                </div>
                                <textarea
                                  value={item.ingredientsEn ?? ''}
                                  onChange={(event) =>
                                    updateItem(
                                      item.stableId,
                                      'ingredientsEn',
                                      event.target.value || null,
                                    )
                                  }
                                  className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                              <label className="space-y-1">
                                <div className="text-xs text-slate-600">
                                  {isZh ? '配料说明(中)' : 'Ingredients (ZH)'}
                                </div>
                                <textarea
                                  value={item.ingredientsZh ?? ''}
                                  onChange={(event) =>
                                    updateItem(
                                      item.stableId,
                                      'ingredientsZh',
                                      event.target.value || null,
                                    )
                                  }
                                  className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                              </label>
                            </div>

                            <div className="rounded-lg border border-slate-200 p-4">
                              <h3 className="text-sm font-semibold">
                                {isZh ? '图片' : 'Image'}
                              </h3>
                              <div className="mt-3 flex flex-wrap items-center gap-3">
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={imageUploads[item.stableId]?.uploading}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.currentTarget.value = '';
                                    if (file) void uploadImage(item.stableId, file);
                                  }}
                                  className="text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveImageItemStableId(item.stableId)
                                  }
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                >
                                  {isZh ? '从媒体库选择' : 'Select from library'}
                                </button>
                                {item.imageUrl ? (
                                  <Image
                                    src={item.imageUrl}
                                    alt=""
                                    width={80}
                                    height={80}
                                    unoptimized
                                    className="h-20 w-20 rounded-md border object-cover"
                                  />
                                ) : null}
                              </div>
                              {imageUploads[item.stableId]?.error ? (
                                <div className="mt-2 text-xs text-red-700">
                                  {imageUploads[item.stableId]?.error}
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-lg border border-slate-200 p-4">
                              <h3 className="text-sm font-semibold">
                                {isZh ? '固定套餐组成' : 'Fixed combo composition'}
                              </h3>
                              <div className="mt-3 space-y-2">
                                {item.fixedComponents.map((component) => (
                                  <div
                                    key={component.componentItemStableId}
                                    className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
                                  >
                                    <span className="flex-1">
                                      {(() => {
                                        const componentItem =
                                          itemByStableId.get(
                                            component.componentItemStableId,
                                          );
                                        return componentItem
                                          ? isZh
                                            ? componentItem.nameZh ??
                                              componentItem.nameEn
                                            : componentItem.nameEn
                                          : component.componentItemStableId;
                                      })()}
                                    </span>
                                    <input
                                      value={String(component.quantity)}
                                      onChange={(event) =>
                                        updateItem(
                                          item.stableId,
                                          'fixedComponents',
                                          item.fixedComponents.map((current) =>
                                            current.componentItemStableId ===
                                            component.componentItemStableId
                                              ? {
                                                  ...current,
                                                  quantity: Math.max(
                                                    1,
                                                    toIntOrZero(
                                                      event.target.value,
                                                    ),
                                                  ),
                                                }
                                              : current,
                                          ),
                                        )
                                      }
                                      className="w-16 rounded-md border border-slate-200 px-2 py-1"
                                      inputMode="numeric"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateItem(
                                          item.stableId,
                                          'fixedComponents',
                                          item.fixedComponents.filter(
                                            (current) =>
                                              current.componentItemStableId !==
                                              component.componentItemStableId,
                                          ),
                                        )
                                      }
                                      className="text-xs font-medium text-rose-700"
                                    >
                                      {isZh ? '移除' : 'Remove'}
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_100px_auto]">
                                <select
                                  value={componentDraft.componentItemStableId}
                                  onChange={(event) =>
                                    setComponentDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        ...componentDraft,
                                        componentItemStableId:
                                          event.target.value,
                                      },
                                    }))
                                  }
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="">
                                    {isZh
                                      ? '选择组成菜品…'
                                      : 'Choose component item…'}
                                  </option>
                                  {items
                                    .filter(
                                      (candidate) =>
                                        candidate.stableId !== item.stableId &&
                                        !item.fixedComponents.some(
                                          (component) =>
                                            component.componentItemStableId ===
                                            candidate.stableId,
                                        ),
                                    )
                                    .map((candidate) => (
                                      <option
                                        key={candidate.stableId}
                                        value={candidate.stableId}
                                      >
                                        {isZh
                                          ? candidate.nameZh ?? candidate.nameEn
                                          : candidate.nameEn}
                                      </option>
                                    ))}
                                </select>
                                <input
                                  value={componentDraft.quantity}
                                  onChange={(event) =>
                                    setComponentDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        ...componentDraft,
                                        quantity: event.target.value,
                                      },
                                    }))
                                  }
                                  inputMode="numeric"
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!componentDraft.componentItemStableId)
                                      return;
                                    updateItem(
                                      item.stableId,
                                      'fixedComponents',
                                      [
                                        ...item.fixedComponents,
                                        {
                                          componentItemStableId:
                                            componentDraft.componentItemStableId,
                                          quantity: Math.max(
                                            1,
                                            toIntOrZero(
                                              componentDraft.quantity,
                                            ),
                                          ),
                                          sortOrder:
                                            item.fixedComponents.length,
                                        },
                                      ],
                                    );
                                    if (item.publishToUberEats) {
                                      updateItem(
                                        item.stableId,
                                        'publishToUberEats',
                                        false,
                                      );
                                    }
                                    setComponentDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        componentItemStableId: '',
                                        quantity: '1',
                                      },
                                    }));
                                  }}
                                  className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
                                >
                                  {isZh ? '添加组成' : 'Add component'}
                                </button>
                              </div>
                            </div>

                            <div className="rounded-lg border border-slate-200 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold">
                                  {isZh ? '选项组绑定' : 'Option group bindings'}
                                </h3>
                                <Link
                                  href={`/${safeLocale}/admin/menu/options?store=${encodeURIComponent(storeStableId)}`}
                                  className="text-xs font-medium text-emerald-700"
                                >
                                  {isZh ? '选项库' : 'Option library'}
                                </Link>
                              </div>
                              <div className="mt-3 space-y-2">
                                {item.optionGroups.map((binding) => {
                                  const key = `${item.stableId}:${binding.templateGroupStableId}`;
                                  const editDraft = getBindingEditDraft(
                                    item.stableId,
                                    binding,
                                  );
                                  return (
                                    <div
                                      key={binding.templateGroupStableId}
                                      className="space-y-2 rounded-md bg-slate-50 px-3 py-2 text-sm"
                                    >
                                      <div className="font-medium">
                                        {isZh
                                          ? binding.template.nameZh ??
                                            binding.template.nameEn
                                          : binding.template.nameEn}
                                      </div>
                                      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                                        <input
                                          value={editDraft.minSelect}
                                          onChange={(event) =>
                                            setBindingEditDrafts((current) => ({
                                              ...current,
                                              [key]: {
                                                ...editDraft,
                                                minSelect: event.target.value,
                                              },
                                            }))
                                          }
                                          placeholder="Min"
                                          inputMode="numeric"
                                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                                        />
                                        <input
                                          value={editDraft.maxSelect}
                                          onChange={(event) =>
                                            setBindingEditDrafts((current) => ({
                                              ...current,
                                              [key]: {
                                                ...editDraft,
                                                maxSelect: event.target.value,
                                              },
                                            }))
                                          }
                                          placeholder="Max"
                                          inputMode="numeric"
                                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                                        />
                                        <input
                                          value={editDraft.sortOrder}
                                          onChange={(event) =>
                                            setBindingEditDrafts((current) => ({
                                              ...current,
                                              [key]: {
                                                ...editDraft,
                                                sortOrder: event.target.value,
                                              },
                                            }))
                                          }
                                          placeholder={isZh ? '排序' : 'Sort'}
                                          inputMode="numeric"
                                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                                        />
                                        <select
                                          value={
                                            editDraft.affectedPackagingTypeStableId
                                          }
                                          onChange={(event) =>
                                            setBindingEditDrafts((current) => ({
                                              ...current,
                                              [key]: {
                                                ...editDraft,
                                                affectedPackagingTypeStableId:
                                                  event.target.value,
                                              },
                                            }))
                                          }
                                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                                        >
                                          <option value="">
                                            {isZh ? '全部包装' : 'All packages'}
                                          </option>
                                          {item.packagings.map((packaging) => (
                                            <option
                                              key={
                                                packaging.packagingType.stableId
                                              }
                                              value={
                                                packaging.packagingType.stableId
                                              }
                                            >
                                              {packaging.packagingType.name}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            disabled={bindingSavingKey === key}
                                            onClick={() =>
                                              void updateBinding(
                                                item.stableId,
                                                binding,
                                              )
                                            }
                                            className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                                          >
                                            {isZh ? '更新' : 'Update'}
                                          </button>
                                          <button
                                            type="button"
                                            disabled={bindingSavingKey === key}
                                            onClick={() =>
                                              void removeBinding(
                                                item.stableId,
                                                binding.templateGroupStableId,
                                              )
                                            }
                                            className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 disabled:opacity-50"
                                          >
                                            {isZh ? '解绑' : 'Unbind'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-7">
                                <select
                                  value={bindingDraft.templateGroupStableId}
                                  onChange={(event) =>
                                    applyTemplateDefaults(
                                      item.stableId,
                                      event.target.value,
                                    )
                                  }
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                                >
                                  <option value="">
                                    {isZh ? '选择选项组' : 'Choose option group'}
                                  </option>
                                  {templates.map((template) => (
                                    <option
                                      key={template.templateGroupStableId}
                                      value={template.templateGroupStableId}
                                    >
                                      {isZh
                                        ? template.nameZh ?? template.nameEn
                                        : template.nameEn}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={bindingDraft.minSelect}
                                  onChange={(event) =>
                                    setBindingDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        ...bindingDraft,
                                        minSelect: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Min"
                                  inputMode="numeric"
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                                <input
                                  value={bindingDraft.maxSelect}
                                  onChange={(event) =>
                                    setBindingDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        ...bindingDraft,
                                        maxSelect: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="Max"
                                  inputMode="numeric"
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                                <input
                                  value={bindingDraft.sortOrder}
                                  onChange={(event) =>
                                    setBindingDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        ...bindingDraft,
                                        sortOrder: event.target.value,
                                      },
                                    }))
                                  }
                                  placeholder={isZh ? '排序' : 'Sort'}
                                  inputMode="numeric"
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                />
                                <select
                                  value={
                                    bindingDraft.affectedPackagingTypeStableId
                                  }
                                  onChange={(event) =>
                                    setBindingDrafts((current) => ({
                                      ...current,
                                      [item.stableId]: {
                                        ...bindingDraft,
                                        affectedPackagingTypeStableId:
                                          event.target.value,
                                      },
                                    }))
                                  }
                                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="">
                                    {isZh ? '全部包装' : 'All packages'}
                                  </option>
                                  {item.packagings.map((packaging) => (
                                    <option
                                      key={packaging.packagingType.stableId}
                                      value={packaging.packagingType.stableId}
                                    >
                                      {packaging.packagingType.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={
                                    !bindingDraft.templateGroupStableId ||
                                    bindingSavingKey !== null
                                  }
                                  onClick={() =>
                                    void saveBinding(
                                      item.stableId,
                                      bindingDraft,
                                    )
                                  }
                                  className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
                                >
                                  {isZh ? '绑定' : 'Bind'}
                                </button>
                              </div>
                            </div>

                            {saveError ? (
                              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {saveError}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>

      {availabilityTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">
              {isZh ? '选择下架方式' : 'Select off mode'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {availabilityTarget.label}
            </p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  const target = availabilityTarget;
                  setAvailabilityTarget(null);
                  void setAvailability(target.stableId, 'TEMP_TODAY_OFF');
                }}
                className="w-full rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700"
              >
                {isZh ? '当日下架' : 'Off today'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = availabilityTarget;
                  setAvailabilityTarget(null);
                  void setAvailability(target.stableId, 'PERMANENT_OFF');
                }}
                className="w-full rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                {isZh ? '永久下架' : 'Off permanently'}
              </button>
              <button
                type="button"
                onClick={() => setAvailabilityTarget(null)}
                className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeImageItemStableId ? (
        <ImageLibraryModal
          isZh={isZh}
          onClose={() => setActiveImageItemStableId(null)}
          onSelect={(url) => {
            updateItem(activeImageItemStableId, 'imageUrl', url);
            setActiveImageItemStableId(null);
          }}
        />
      ) : null}
    </StaffPage>
  );
}
